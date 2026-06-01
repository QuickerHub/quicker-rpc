using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Common;

namespace QuickerRpc.Plugin.Services;

internal static class ActionCatalogSearch
{
    public static IReadOnlyList<(int Score, ActionCatalogEntry Entry)> Match(
        string? query,
        string? scope,
        int maxResults,
        Func<ActionItem, bool>? actionFilter = null)
    {
        var keyword = (query ?? string.Empty).Trim();
        var max = Math.Max(1, Math.Min(maxResults <= 0 ? 30 : maxResults, 200));
        var scored = new List<(int Score, ActionCatalogEntry Entry)>();

        foreach (var entry in ActionCatalogEnumerator.Enumerate(scope))
        {
            if (actionFilter is not null && !actionFilter(entry.Action))
            {
                continue;
            }

            var score = keyword.Length == 0
                ? 1
                : ActionSearchFuzzyMatch.ComputeScore(
                    keyword,
                    entry.Action.Id,
                    entry.Action.Title ?? string.Empty,
                    entry.Action.Description);
            if (score <= 0)
            {
                continue;
            }

            scored.Add((score, entry));
        }

        return scored
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.Action.Title, StringComparer.OrdinalIgnoreCase)
            .Take(max)
            .ToList();
    }
}
