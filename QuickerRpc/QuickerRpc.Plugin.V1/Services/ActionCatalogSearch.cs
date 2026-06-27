using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;
using Quicker.Domain.Profiles;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Services;

internal static class ActionCatalogSearch
{
    public static bool TryMatchSpec(
        ActionSearchQuerySpec spec,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter,
        Func<ActionItem, long> getEditMs,
        bool limitResults,
        out IReadOnlyList<(int Score, ActionCatalogEntry Entry)> matches,
        out string? error)
    {
        matches = Array.Empty<(int, ActionCatalogEntry)>();
        error = null;

        if (spec.IsEmpty)
        {
            matches = ListRecentByLastEdit(scope, maxResults, actionFilter, getEditMs);
            return true;
        }

        if (spec.SubProgramSearch is { } subProgramSearch)
        {
            matches = MatchSubProgramReference(subProgramSearch, scope, maxResults, actionFilter, limitResults);
            return true;
        }

        if (spec.SourceFilter is { } sourceFilter
            && !spec.HasFilterScript
            && !spec.HasSortScript)
        {
            var legacyKeyword = spec.Keyword ?? string.Empty;
            matches = MatchSourceFilter(sourceFilter, legacyKeyword, scope, maxResults, actionFilter, limitResults);
            return true;
        }

        if (!string.IsNullOrWhiteSpace(spec.Keyword)
            && !spec.HasFilterScript
            && !spec.HasSortScript
            && spec.SourceFilter is null)
        {
            matches = Match(
                spec.Keyword,
                scope,
                maxResults,
                actionFilter,
                limitResults);
            return true;
        }

        return TryMatchWithScripts(
            spec,
            scope,
            maxResults,
            actionFilter,
            getEditMs,
            limitResults,
            out matches,
            out error);
    }

    private static bool TryMatchWithScripts(
        ActionSearchQuerySpec spec,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter,
        Func<ActionItem, long> getEditMs,
        bool limitResults,
        out IReadOnlyList<(int Score, ActionCatalogEntry Entry)> matches,
        out string? error)
    {
        matches = Array.Empty<(int, ActionCatalogEntry)>();
        error = null;

        ActionSearchScriptEvaluator? scriptEvaluator = null;
        if (spec.UsesScript)
        {
            if (!QuickerHost.IsRunningInQuicker())
            {
                error = "Script filter/sorter requires Quicker runtime (Z.Expressions).";
                return false;
            }

            scriptEvaluator = new ActionSearchScriptEvaluator();
        }

        var keyword = spec.Keyword ?? string.Empty;
        var keywordIsEmpty = keyword.Length == 0;
        var candidates = new List<(int Score, ActionCatalogEntry Entry, long EditMs, ActionSearchScriptRow Row)>();

        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope))
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            if (spec.SourceFilter is { } sourceFilter
                && !ActionItemSourceHelper.MatchesSourceFilter(entry.Action, sourceFilter))
            {
                continue;
            }

            var editMs = getEditMs(entry.Action);
            var score = keywordIsEmpty
                ? ActionSearchQuery.SourceFilterScore
                : ActionSearchFuzzyMatch.ComputeScore(
                    keyword,
                    entry.Action.Id,
                    entry.Action.Title ?? string.Empty,
                    entry.Action.Description,
                    entry.Profile?.Name,
                    entry.Profile?.ExeFile);
            if (!keywordIsEmpty && score <= 0)
            {
                continue;
            }

            var row = ActionSearchScriptRow.FromEntry(entry, editMs, score);
            if (scriptEvaluator is not null && !string.IsNullOrWhiteSpace(spec.FilterScript))
            {
                if (!scriptEvaluator.TryEvaluateFilter(spec.FilterScript!, row, out var matched, out error))
                {
                    error = "Filter script error: " + error;
                    return false;
                }

                if (!matched)
                {
                    continue;
                }
            }

            candidates.Add((score, entry, editMs, row));
        }

        var max = limitResults ? ClampLimit(maxResults) : int.MaxValue;
        if (spec.HasSortScript && scriptEvaluator is not null)
        {
            var keyed = new List<(int Score, ActionCatalogEntry Entry, object?[] SortKeys)>(candidates.Count);
            foreach (var item in candidates)
            {
                var sortKeys = new object?[spec.SortRules.Count];
                for (var i = 0; i < spec.SortRules.Count; i++)
                {
                    if (!scriptEvaluator.TryEvaluateSorter(spec.SortRules[i].Script, item.Row, out sortKeys[i], out error))
                    {
                        error = "Sort script error: " + error;
                        return false;
                    }
                }

                keyed.Add((item.Score, item.Entry, sortKeys));
            }

            IOrderedEnumerable<(int Score, ActionCatalogEntry Entry, object?[] SortKeys)>? sorted = null;
            for (var i = 0; i < spec.SortRules.Count; i++)
            {
                var ruleIndex = i;
                var rule = spec.SortRules[i];
                if (sorted is null)
                {
                    sorted = rule.Descending
                        ? keyed.OrderByDescending(x => x.SortKeys[ruleIndex], ActionSearchSortKeyComparer.Instance)
                        : keyed.OrderBy(x => x.SortKeys[ruleIndex], ActionSearchSortKeyComparer.Instance);
                    continue;
                }

                sorted = rule.Descending
                    ? sorted.ThenByDescending(x => x.SortKeys[ruleIndex], ActionSearchSortKeyComparer.Instance)
                    : sorted.ThenBy(x => x.SortKeys[ruleIndex], ActionSearchSortKeyComparer.Instance);
            }

            matches = (sorted ?? keyed.OrderBy(x => 0))
                .Take(max)
                .Select(x => (x.Score, x.Entry))
                .ToList();
            return true;
        }

        IEnumerable<(int Score, ActionCatalogEntry Entry, long EditMs, ActionSearchScriptRow Row)> ordered;
        if (!keywordIsEmpty)
        {
            ordered = candidates
                .OrderByDescending(x => x.Score)
                .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase);
        }
        else
        {
            ordered = candidates
                .OrderByDescending(x => x.EditMs)
                .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase);
        }

        matches = ordered
            .Take(max)
            .Select(x => (x.Score, x.Entry))
            .ToList();
        return true;
    }

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

        if (ActionSearchQuery.TryParseSourceFilter(keyword, out var sourceFilter, out var textKeyword))
        {
            return MatchSourceFilter(sourceFilter, textKeyword, scope, maxResults, actionFilter, limitResults);
        }

        if (ActionSearchQuery.TryParseSubProgramReference(keyword, out var subProgramSearch))
        {
            return MatchSubProgramReference(subProgramSearch, scope, maxResults, actionFilter, limitResults);
        }

        if (ActionCatalogSearchHub.TryMatch(
                keyword,
                scope,
                sourceFilter: null,
                maxResults,
                actionFilter,
                limitResults,
                emptyKeywordScore: 1,
                out var indexedMatches))
        {
            return indexedMatches;
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

    private static IReadOnlyList<(int Score, ActionCatalogEntry Entry)> MatchSourceFilter(
        ActionSourceFilter sourceFilter,
        string keyword,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter,
        bool limitResults)
    {
        if (ActionCatalogSearchHub.TryMatch(
                keyword,
                scope,
                sourceFilter,
                maxResults,
                actionFilter,
                limitResults,
                emptyKeywordScore: ActionSearchQuery.SourceFilterScore,
                out var indexedMatches))
        {
            return indexedMatches;
        }

        var scored = new List<(int Score, ActionCatalogEntry Entry)>();
        var keywordIsEmpty = keyword.Length == 0;

        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope))
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            if (!ActionItemSourceHelper.MatchesSourceFilter(entry.Action, sourceFilter))
            {
                continue;
            }

            var score = keywordIsEmpty
                ? ActionSearchQuery.SourceFilterScore
                : ActionSearchFuzzyMatch.ComputeScore(
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

        return ordered.Take(ClampLimit(maxResults)).ToList();
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
