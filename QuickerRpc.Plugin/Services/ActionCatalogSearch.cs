using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;
using Quicker.Domain.Profiles;

namespace QuickerRpc.Plugin.Services;

internal static class ActionCatalogSearch
{
    public static IReadOnlyList<(int Score, ActionCatalogEntry Entry)> Match(
        string? query,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter = null,
        bool limitResults = true)
    {
        var keyword = (query ?? string.Empty).Trim();
        if (keyword.Length == 0)
        {
            return ListRecentByLastEdit(scope, maxResults, actionFilter);
        }

        if (ActionSearchQuery.TryParseSubProgramReference(keyword, out var subProgramSearch))
        {
            return MatchSubProgramReference(subProgramSearch, scope, maxResults, actionFilter, limitResults);
        }

        var scored = new List<(int Score, ActionCatalogEntry Entry)>();

        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope))
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            var score = ActionSearchFuzzyMatch.ComputeScore(
                keyword,
                entry.Action.Id,
                entry.Action.Title ?? string.Empty,
                entry.Action.Description,
                entry.Profile?.Name,
                entry.Profile?.ExeFile);
            if (score <= 0)
            {
                continue;
            }

            scored.Add((score, entry));
        }

        var ordered = scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase);

        if (!limitResults)
        {
            return ordered.ToList();
        }

        var max = ClampLimit(maxResults);
        return ordered.Take(max).ToList();
    }

    private static IReadOnlyList<(int Score, ActionCatalogEntry Entry)> MatchSubProgramReference(
        SubProgramReferenceSearch search,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter,
        bool limitResults)
    {
        var matches = search.DedicatedOnly
            ? ActionSubProgramCallScanner.FindActionsDedicatedToSubProgram(search.SubProgramRef)
            : ActionSubProgramCallScanner.FindActionsCallingSubProgram(search.SubProgramRef);

        HashSet<string>? allowedProfileIds = null;
        if (!string.IsNullOrWhiteSpace(scope))
        {
            var manager = ProfileManagerAccessor.TryCreate()?.Instance;
            if (manager is not null)
            {
                allowedProfileIds = new HashSet<string>(
                    ActionScopeResolver.ResolveProfiles(manager, scope)
                        .Select(p => (p.Id ?? string.Empty).Trim())
                        .Where(id => id.Length > 0),
                    StringComparer.OrdinalIgnoreCase);
            }
        }

        var scored = new List<(int Score, ActionCatalogEntry Entry)>();
        foreach (var entry in matches)
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            if (allowedProfileIds is not null)
            {
                var profileId = (entry.Profile?.Id ?? string.Empty).Trim();
                if (profileId.Length == 0 || !allowedProfileIds.Contains(profileId))
                {
                    continue;
                }
            }

            scored.Add((ActionSearchQuery.SubProgramReferenceScore, entry));
        }

        var ordered = scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase);

        if (!limitResults)
        {
            return ordered.ToList();
        }

        return ordered.Take(ClampLimit(maxResults)).ToList();
    }

    /// <summary>
    /// Recently edited actions (newest first). Uses a bounded top-K pass instead of sorting the full catalog.
    /// </summary>
    public static IReadOnlyList<(int Score, ActionCatalogEntry Entry)> ListRecentByLastEdit(
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter = null,
        Func<ActionItem, long>? editVersionMs = null)
    {
        var limit = ClampLimit(maxResults);
        var getEdit = editVersionMs ?? ActionDesignerProgramAccess.GetEditVersionMs;
        var top = new List<(long EditMs, int Score, ActionCatalogEntry Entry)>(limit);

        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope))
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            var editMs = getEdit(entry.Action);
            TryInsertTopByEdit(top, limit, editMs, score: 1, entry);
        }

        return top
            .OrderByDescending(x => x.EditMs)
            .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase)
            .Select(x => (x.Score, x.Entry))
            .ToList();
    }

    internal static void TryInsertTopByEdit(
        List<(long EditMs, int Score, ActionCatalogEntry Entry)> top,
        int limit,
        long editMs,
        int score,
        ActionCatalogEntry entry)
    {
        if (top.Count < limit)
        {
            top.Add((editMs, score, entry));
            if (top.Count == limit)
            {
                top.Sort(static (a, b) =>
                {
                    var byEdit = a.EditMs.CompareTo(b.EditMs);
                    return byEdit != 0 ? byEdit : string.Compare(a.Entry.Action.Title, b.Entry.Action.Title, StringComparison.OrdinalIgnoreCase);
                });
            }

            return;
        }

        if (editMs < top[0].EditMs)
        {
            return;
        }

        top[0] = (editMs, score, entry);
        top.Sort(static (a, b) =>
        {
            var byEdit = a.EditMs.CompareTo(b.EditMs);
            return byEdit != 0 ? byEdit : string.Compare(a.Entry.Action.Title, b.Entry.Action.Title, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static int ClampLimit(int maxResults) =>
        Math.Max(1, Math.Min(maxResults <= 0 ? 30 : maxResults, 200));
}
