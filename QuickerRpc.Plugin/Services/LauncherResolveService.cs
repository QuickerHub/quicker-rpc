using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Unified launcher resolve: search settings/actions/subprograms, score, and rank for agent pick.
/// </summary>
public sealed class LauncherResolveService
{
    private readonly ActionSearchService _actionSearchService;
    private readonly SubProgramSearchService _subProgramSearchService;
    private readonly QuickerSettingsService _settingsService;
    private readonly QuickerSettingsUiService _settingsUiService;

    public LauncherResolveService(
        ActionSearchService actionSearchService,
        SubProgramSearchService subProgramSearchService,
        QuickerSettingsService settingsService,
        QuickerSettingsUiService settingsUiService)
    {
        _actionSearchService = actionSearchService;
        _subProgramSearchService = subProgramSearchService;
        _settingsService = settingsService;
        _settingsUiService = settingsUiService;
    }

    public QuickerRpcResolveLauncherIntentResult Resolve(string? query, int maxResults, string? scopes)
    {
        var text = (query ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return new QuickerRpcResolveLauncherIntentResult
            {
                Ok = false,
                Query = text,
                Message = "query is required.",
            };
        }

        var limit = Clamp(maxResults, 1, 30);
        var scopeSet = ParseScopes(scopes);
        var includeSettings = scopeSet is null || scopeSet.Contains("settings");
        var includeActions = scopeSet is null || scopeSet.Contains("actions");
        var includeSubprograms = scopeSet is null || scopeSet.Contains("subprograms");

        var candidates = new List<QuickerRpcLauncherIntentCandidate>();
        var dedupe = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (includeSettings)
        {
            CollectSettingsCandidates(text, limit, candidates, dedupe);
        }

        if (includeActions)
        {
            CollectActionCandidates(text, limit, candidates, dedupe);
        }

        if (includeSubprograms)
        {
            CollectSubProgramCandidates(text, limit, candidates, dedupe);
        }

        var ranked = candidates
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();

        return new QuickerRpcResolveLauncherIntentResult
        {
            Ok = ranked.Count > 0,
            Query = text,
            NormalizedQuery = text,
            Message = ranked.Count == 0
                ? "No launcher intent matched."
                : $"Top match: {ranked[0].Title} ({ranked[0].Kind}).",
            Candidates = ranked,
        };
    }

    private void CollectSettingsCandidates(
        string query,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var intent = _settingsUiService.ResolveIntent(query: query);
        if (intent.Ok && !string.Equals(intent.Intent, "unknown", StringComparison.OrdinalIgnoreCase))
        {
            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "settings-intent",
                Score = 1000,
                Title = BuildSettingsIntentTitle(intent),
                Subtitle = intent.Message,
                Intent = intent.Intent,
                PageId = intent.PageId,
                PresetId = intent.PresetId,
                SettingKey = intent.SettingKey,
                Target = intent.Target,
                SuggestedTool = "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(BuildSettingsOpenInput(intent)),
                Reason = "settings intent resolve",
            });
        }

        foreach (var link in SettingsDirectLinkCatalog.ListLinks())
        {
            if (!MatchesDirectLink(query, link))
            {
                continue;
            }

            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "settings-preset",
                Score = 920,
                Title = link.Title,
                Subtitle = link.Id,
                PresetId = link.Id,
                PageId = link.Target,
                Target = link.Target,
                Intent = "open-ui",
                SuggestedTool = "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "open",
                    ["preset"] = link.Id,
                }),
                Reason = "settings direct link preset",
            });
        }

        var searchLimit = Math.Max(limit, 8);
        var search = _settingsService.Search(query, searchLimit);
        for (var i = 0; i < search.Pages.Count; i++)
        {
            var page = search.Pages[i];
            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "settings-page",
                Score = 850 - i * 30,
                Title = page.Title,
                Subtitle = page.PageId,
                PageId = page.PageId,
                Target = page.PageId,
                Intent = "open-ui",
                SuggestedTool = "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "open",
                    ["page"] = page.PageId,
                }),
                Reason = "settings page search",
            });
        }

        for (var i = 0; i < search.Items.Count; i++)
        {
            var item = search.Items[i];
            if (string.IsNullOrWhiteSpace(item.Key))
            {
                continue;
            }

            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "settings-key",
                Score = 650 - i * 25,
                Title = item.Title ?? item.Path,
                Subtitle = item.Key,
                SettingKey = item.Key,
                PageId = item.PageId,
                SuggestedTool = string.Equals(intent.SuggestedAction, "set", StringComparison.OrdinalIgnoreCase)
                    ? "quicker_settings"
                    : "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "get",
                    ["key"] = item.Key,
                }),
                Reason = "settings key search",
            });
        }
    }

    private void CollectActionCandidates(
        string query,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var result = _actionSearchService.SearchActions(query, limit, scope: null);
        if (!result.Ok)
        {
            return;
        }

        foreach (var action in result.Items)
        {
            if (string.IsNullOrWhiteSpace(action.Id))
            {
                continue;
            }

            var score = 400 + Math.Min(action.Score, 250);
            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "action",
                Score = score,
                Title = action.Title,
                Subtitle = action.ProfileName ?? action.ExeFile,
                ActionId = action.Id,
                SuggestedTool = "qkrpc_action",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "run",
                    ["id"] = action.Id,
                }),
                Reason = "action search",
            });
        }
    }

    private void CollectSubProgramCandidates(
        string query,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var result = _subProgramSearchService.Search(query, limit);
        if (!result.Ok)
        {
            return;
        }

        foreach (var sub in result.Items)
        {
            if (string.IsNullOrWhiteSpace(sub.Id))
            {
                continue;
            }

            var score = 350 + Math.Min(sub.Score, 250);
            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "subprogram",
                Score = score,
                Title = sub.Name,
                Subtitle = sub.Description,
                SubProgramId = sub.Id,
                SuggestedTool = "qkrpc_subprogram",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "get",
                    ["id"] = sub.Id,
                }),
                Reason = "subprogram search",
            });
        }
    }

    private static bool MatchesDirectLink(string query, SettingsDirectLinkListItem link)
    {
        if (string.Equals(query, link.Id, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        foreach (var alias in link.Aliases)
        {
            if (string.Equals(query, alias, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (query.Contains(alias, StringComparison.OrdinalIgnoreCase)
                || alias.Contains(query, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return query.Contains(link.Title, StringComparison.OrdinalIgnoreCase)
               || link.Title.Contains(query, StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildSettingsIntentTitle(QuickerRpcResolveSettingsIntentResult intent)
    {
        if (string.Equals(intent.Intent, "open-search", StringComparison.OrdinalIgnoreCase))
        {
            return "Quicker 搜索窗口";
        }

        if (!string.IsNullOrWhiteSpace(intent.PageId))
        {
            return intent.PageId!;
        }

        if (!string.IsNullOrWhiteSpace(intent.PresetId))
        {
            return intent.PresetId!;
        }

        return intent.Intent;
    }

    private static Dictionary<string, object?> BuildSettingsOpenInput(QuickerRpcResolveSettingsIntentResult intent)
    {
        var input = new Dictionary<string, object?> { ["action"] = "open" };
        if (!string.IsNullOrWhiteSpace(intent.PresetId))
        {
            input["preset"] = intent.PresetId;
            return input;
        }

        if (string.Equals(intent.Intent, "open-search", StringComparison.OrdinalIgnoreCase))
        {
            input["page"] = "search";
            if (!string.IsNullOrWhiteSpace(intent.SearchText))
            {
                input["searchText"] = intent.SearchText;
            }

            return input;
        }

        if (!string.IsNullOrWhiteSpace(intent.SettingKey))
        {
            input["key"] = intent.SettingKey;
            return input;
        }

        if (!string.IsNullOrWhiteSpace(intent.PageId))
        {
            input["page"] = intent.PageId;
            return input;
        }

        input["query"] = intent.Target;
        return input;
    }

    private static void AddCandidate(
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe,
        QuickerRpcLauncherIntentCandidate candidate)
    {
        var key = $"{candidate.Kind}:{candidate.PresetId ?? candidate.PageId ?? candidate.SettingKey ?? candidate.ActionId ?? candidate.SubProgramId ?? candidate.Title}";
        if (!dedupe.Add(key))
        {
            var existing = candidates.FirstOrDefault(c =>
                string.Equals($"{c.Kind}:{c.PresetId ?? c.PageId ?? c.SettingKey ?? c.ActionId ?? c.SubProgramId ?? c.Title}", key, StringComparison.OrdinalIgnoreCase));
            if (existing is not null && candidate.Score > existing.Score)
            {
                existing.Score = candidate.Score;
                existing.Reason = candidate.Reason;
            }

            return;
        }

        candidates.Add(candidate);
    }

    private static string SerializeSuggestedInput(Dictionary<string, object?> input) =>
        JsonSerializer.Serialize(input);

    private static HashSet<string>? ParseScopes(string? scopes)
    {
        var text = (scopes ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return null;
        }

        return text
            .Split(new[] { ',', ';', '|', ' ' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Trim().ToLowerInvariant())
            .Where(part => part.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static int Clamp(int value, int min, int max) => Math.Max(min, Math.Min(max, value));
}
