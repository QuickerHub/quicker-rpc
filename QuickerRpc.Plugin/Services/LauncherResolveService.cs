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

        var terms = LauncherQueryParser.ParseAlternatives(text);
        if (terms.Count == 0)
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

        foreach (var term in terms)
        {
            var searchKeyword = LauncherQueryParser.ToSearchKeyword(term);
            if (searchKeyword.Length == 0 && term.IndexOf('*') >= 0)
            {
                continue;
            }

            if (includeSettings)
            {
                CollectSettingsCandidates(term, searchKeyword, limit, candidates, dedupe);
            }

            if (includeActions)
            {
                CollectActionCandidates(term, searchKeyword, limit, candidates, dedupe);
            }

            if (includeSubprograms)
            {
                CollectSubProgramCandidates(term, searchKeyword, limit, candidates, dedupe);
            }
        }

        var ranked = candidates
            .OrderByDescending(c => c.Score)
            .ThenBy(c => c.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();

        var matchedTerms = ranked
            .Select(c => c.MatchedQueryTerm)
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var missedTerms = terms
            .Where(term => !matchedTerms.Contains(term))
            .ToList();

        return new QuickerRpcResolveLauncherIntentResult
        {
            Ok = ranked.Count > 0,
            Query = text,
            NormalizedQuery = string.Join(" | ", terms),
            QueryTerms = terms.ToList(),
            MissedTerms = missedTerms,
            Message = ranked.Count == 0
                ? "No launcher intent matched."
                : BuildResultMessage(ranked, missedTerms),
            Candidates = ranked,
        };
    }

    private static string BuildResultMessage(
        IReadOnlyList<QuickerRpcLauncherIntentCandidate> ranked,
        IReadOnlyList<string> missedTerms)
    {
        var top = ranked[0];
        var message = $"Top match: {top.Title} ({top.Kind})";
        if (!string.IsNullOrWhiteSpace(top.MatchedQueryTerm))
        {
            message += $" via term \"{top.MatchedQueryTerm}\"";
        }

        if (missedTerms.Count > 0)
        {
            message += $"; missed: {string.Join(", ", missedTerms)}";
        }

        return message;
    }

    private void CollectSettingsCandidates(
        string queryTerm,
        string searchKeyword,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var intent = _settingsUiService.ResolveIntent(query: searchKeyword);
        if (intent.Ok && !string.Equals(intent.Intent, "unknown", StringComparison.OrdinalIgnoreCase))
        {
            var title = BuildSettingsIntentTitle(intent);
            AddCandidate(candidates, dedupe, new QuickerRpcLauncherIntentCandidate
            {
                Kind = "settings-intent",
                Score = 1000,
                Title = title,
                Subtitle = intent.Message,
                Intent = intent.Intent,
                PageId = intent.PageId,
                PresetId = intent.PresetId,
                SettingKey = intent.SettingKey,
                Target = intent.Target,
                SuggestedTool = "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(BuildSettingsOpenInput(intent)),
                Reason = "settings intent resolve",
            }, queryTerm, MatchFields.From(title, intent.Message, intent.PageId, intent.PresetId, intent.SettingKey, intent.Target));
        }

        foreach (var link in SettingsDirectLinkCatalog.ListLinks())
        {
            if (!MatchesDirectLink(queryTerm, searchKeyword, link))
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
            }, queryTerm, MatchFields.From(link.Title, link.Id, pageId: link.Target, presetId: link.Id, aliases: link.Aliases));
        }

        var searchLimit = Math.Max(limit, 8);
        var search = _settingsService.Search(searchKeyword, searchLimit);
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
            }, queryTerm, MatchFields.From(page.Title, page.Description ?? page.PageId, pageId: page.PageId, keywords: page.Keywords));
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
                SuggestedTool = "quicker_settings",
                SuggestedInputJson = SerializeSuggestedInput(new Dictionary<string, object?>
                {
                    ["action"] = "get",
                    ["key"] = item.Key,
                }),
                Reason = "settings key search",
            }, queryTerm, MatchFields.From(item.Title, item.Path, pageId: item.PageId, settingKey: item.Key));
        }
    }

    private void CollectActionCandidates(
        string queryTerm,
        string searchKeyword,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var result = _actionSearchService.SearchActions(searchKeyword, limit, scope: null);
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
            }, queryTerm, MatchFields.From(action.Title, action.ProfileName ?? action.ExeFile, actionId: action.Id));
        }
    }

    private void CollectSubProgramCandidates(
        string queryTerm,
        string searchKeyword,
        int limit,
        List<QuickerRpcLauncherIntentCandidate> candidates,
        HashSet<string> dedupe)
    {
        var result = _subProgramSearchService.Search(searchKeyword, limit);
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
            }, queryTerm, MatchFields.From(sub.Name, sub.Description, subProgramId: sub.Id));
        }
    }

    private static bool MatchesDirectLink(
        string queryTerm,
        string searchKeyword,
        SettingsDirectLinkListItem link)
    {
        if (LauncherQueryParser.Matches(queryTerm, link.Id)
            || LauncherQueryParser.Matches(searchKeyword, link.Id))
        {
            return true;
        }

        foreach (var alias in link.Aliases)
        {
            if (LauncherQueryParser.Matches(queryTerm, alias)
                || LauncherQueryParser.Matches(searchKeyword, alias))
            {
                return true;
            }
        }

        return LauncherQueryParser.Matches(queryTerm, link.Title)
               || LauncherQueryParser.Matches(searchKeyword, link.Title);
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
        QuickerRpcLauncherIntentCandidate candidate,
        string queryTerm,
        MatchFields fields)
    {
        var matchedOn = fields.FindMatchedOn(queryTerm);
        if (matchedOn is null && queryTerm.IndexOf('*') >= 0)
        {
            return;
        }

        candidate.MatchedQueryTerm = queryTerm;
        candidate.MatchedOn = matchedOn ?? $"term: {queryTerm}";

        var key = $"{candidate.Kind}:{candidate.PresetId ?? candidate.PageId ?? candidate.SettingKey ?? candidate.ActionId ?? candidate.SubProgramId ?? candidate.Title}";
        if (!dedupe.Add(key))
        {
            var existing = candidates.FirstOrDefault(c =>
                string.Equals($"{c.Kind}:{c.PresetId ?? c.PageId ?? c.SettingKey ?? c.ActionId ?? c.SubProgramId ?? c.Title}", key, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                if (candidate.Score > existing.Score)
                {
                    existing.Score = candidate.Score;
                    existing.Reason = candidate.Reason;
                    existing.MatchedQueryTerm = candidate.MatchedQueryTerm;
                    existing.MatchedOn = candidate.MatchedOn;
                }
                else if (!string.Equals(existing.MatchedQueryTerm, queryTerm, StringComparison.OrdinalIgnoreCase)
                         && !string.IsNullOrWhiteSpace(existing.MatchedQueryTerm))
                {
                    existing.Score += 40;
                    existing.MatchedQueryTerm += $" | {queryTerm}";
                }
            }

            return;
        }

        candidates.Add(candidate);
    }

    private sealed class MatchFields
    {
        public string? Title { get; set; }

        public string? Subtitle { get; set; }

        public string? PageId { get; set; }

        public string? PresetId { get; set; }

        public string? SettingKey { get; set; }

        public string? Target { get; set; }

        public string? ActionId { get; set; }

        public string? SubProgramId { get; set; }

        public string? Keywords { get; set; }

        public string? Snippet { get; set; }

        public IEnumerable<string>? Aliases { get; set; }

        public static MatchFields From(
            string? title,
            string? subtitle = null,
            string? pageId = null,
            string? presetId = null,
            string? settingKey = null,
            string? target = null,
            IEnumerable<string>? aliases = null,
            string? keywords = null,
            string? snippet = null,
            string? actionId = null,
            string? subProgramId = null)
        {
            return new MatchFields
            {
                Title = title,
                Subtitle = subtitle,
                PageId = pageId,
                PresetId = presetId,
                SettingKey = settingKey,
                Target = target,
                Aliases = aliases,
                Keywords = keywords,
                Snippet = snippet,
                ActionId = actionId,
                SubProgramId = subProgramId,
            };
        }

        public string? FindMatchedOn(string queryTerm)
        {
            var matched = LauncherQueryParser.FindMatchedOn(
                queryTerm,
                ("title", Title),
                ("subtitle", Subtitle),
                ("pageId", PageId),
                ("presetId", PresetId),
                ("settingKey", SettingKey),
                ("target", Target),
                ("actionId", ActionId),
                ("subProgramId", SubProgramId),
                ("keywords", Keywords),
                ("snippet", Snippet));

            if (matched is not null)
            {
                return matched;
            }

            foreach (var alias in Aliases ?? Array.Empty<string>())
            {
                matched = LauncherQueryParser.FindMatchedOn(queryTerm, ("alias", alias));
                if (matched is not null)
                {
                    return matched;
                }
            }

            return null;
        }
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
