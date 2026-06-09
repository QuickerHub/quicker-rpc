using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;
using QuickerRpc.AgentModel.Search;

namespace QuickerRpc.Plugin.Services.Search;

/// <summary>Indexed action keyword search backed by <see cref="AgentSearchHub"/>.</summary>
internal static class ActionCatalogSearchHub
{
    public static bool TryMatch(
        string keyword,
        string? scope,
        ActionSourceFilter? sourceFilter,
        int maxResults,
        Func<ActionItem, bool>? actionFilter,
        bool limitResults,
        int emptyKeywordScore,
        out IReadOnlyList<(int Score, ActionCatalogEntry Entry)> matches)
    {
        matches = Array.Empty<(int, ActionCatalogEntry)>();
        if (!AppServices.IsInitialized)
        {
            return false;
        }

        var coordinator = AppServices.GetRequired<AgentSearchIndexCoordinator>();
        if (!coordinator.IsReady(SearchRegion.Action))
        {
            coordinator.ScheduleBuild(SearchRegion.Action);
            return false;
        }

        var hub = AppServices.GetRequired<AgentSearchHub>();
        var scopeProfileIds = ResolveScopeProfileIds(scope);
        var keywordIsEmpty = keyword.Length == 0;
        var request = new SearchRequest
        {
            Regions = new[] { SearchRegion.Action },
            Query = keywordIsEmpty ? null : keyword,
            Limit = maxResults,
            LimitResults = limitResults,
            DocumentFilter = doc => PassesFilter(doc, scopeProfileIds, actionFilter, sourceFilter),
        };

        var hits = hub.Search(request);
        if (hits.Count == 0 && !keywordIsEmpty)
        {
            matches = Array.Empty<(int, ActionCatalogEntry)>();
            return true;
        }

        var rows = new List<(int Score, ActionCatalogEntry Entry)>(hits.Count);
        foreach (var hit in hits)
        {
            if (hit.Payload is not ActionCatalogEntry entry)
            {
                continue;
            }

            var score = keywordIsEmpty ? emptyKeywordScore : hit.Score;
            rows.Add((score, entry));
        }

        matches = rows;
        return true;
    }

    private static bool PassesFilter(
        SearchDocument document,
        HashSet<string>? scopeProfileIds,
        Func<ActionItem, bool>? actionFilter,
        ActionSourceFilter? sourceFilter)
    {
        if (document.Payload is not ActionCatalogEntry entry)
        {
            return false;
        }

        if (actionFilter is not null && !actionFilter(entry.Action))
        {
            return false;
        }

        if (scopeProfileIds is not null)
        {
            var profileId = (entry.Profile?.Id ?? string.Empty).Trim();
            if (profileId.Length == 0 || !scopeProfileIds.Contains(profileId))
            {
                return false;
            }
        }

        if (sourceFilter is { } filter && !ActionItemSourceHelper.MatchesSourceFilter(entry.Action, filter))
        {
            return false;
        }

        return true;
    }

    private static HashSet<string>? ResolveScopeProfileIds(string? scope)
    {
        if (string.IsNullOrWhiteSpace(scope))
        {
            return null;
        }

        var manager = ProfileManagerAccessor.TryCreate()?.Instance;
        if (manager is null)
        {
            return null;
        }

        return new HashSet<string>(
            ActionScopeResolver.ResolveProfiles(manager, scope)
                .Select(p => (p.Id ?? string.Empty).Trim())
                .Where(id => id.Length > 0),
            StringComparer.OrdinalIgnoreCase);
    }
}
