using System;
using System.Collections.Generic;
using System.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Global subprogram lookup for the action-designer target picker (name, id, call identifier).
/// </summary>
internal static class ActionDesignerSubProgramTargetSearch
{
    private const int DefaultLimit = 30;

    internal sealed class Row
    {
        public required string Id { get; init; }

        public required string Name { get; init; }

        public string? Description { get; init; }

        public required string CallIdentifier { get; init; }

        public int Score { get; init; }

        public string DisplayLabel => string.IsNullOrWhiteSpace(Description)
            ? $"{Name}  ·  {CallIdentifier}"
            : $"{Name}  ·  {CallIdentifier}  —  {Description}";
    }

    public static IReadOnlyList<Row> Search(string? query, int maxCount = DefaultLimit)
    {
        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            return Array.Empty<Row>();
        }

        var keyword = (query ?? string.Empty).Trim();
        var limit = NormalizeLimit(maxCount);
        var rows = new Dictionary<string, Row>(StringComparer.OrdinalIgnoreCase);

        if (keyword.Length == 0)
        {
            foreach (var hit in SubProgramSearchLinear.Search(
                         accessor.EnumerateAll(),
                         keyword,
                         limit,
                         subProgramFilter: null,
                         emptyKeywordScore: 1))
            {
                AddRow(rows, hit);
            }

            return OrderRows(rows.Values, limit);
        }

        if (TryIndexedSearch(keyword, limit, rows))
        {
            // Indexed path filled rows.
        }
        else
        {
            foreach (var hit in SubProgramSearchLinear.Search(accessor.EnumerateAll(), keyword, limit))
            {
                AddRow(rows, hit);
            }
        }

        TryAddDirectLookup(accessor, keyword, rows);
        foreach (var alt in EnumerateLookupKeys(keyword))
        {
            TryAddDirectLookup(accessor, alt, rows);
        }

        return OrderRows(rows.Values, limit);
    }

    public static bool TryResolveCallIdentifier(string? query, out string? callIdentifier)
    {
        callIdentifier = null;
        var keyword = (query ?? string.Empty).Trim();
        if (keyword.Length == 0)
        {
            return false;
        }

        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            return false;
        }

        foreach (var key in EnumerateLookupKeys(keyword).Prepend(keyword))
        {
            if (!accessor.TryGetByIdOrName(key, out var subProgram, out _) || subProgram is null)
            {
                continue;
            }

            callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);
            return !string.IsNullOrWhiteSpace(callIdentifier);
        }

        var top = Search(keyword, 1).FirstOrDefault();
        if (top is null)
        {
            return false;
        }

        callIdentifier = top.CallIdentifier;
        return true;
    }

    private static bool TryIndexedSearch(string keyword, int limit, Dictionary<string, Row> rows)
    {
        if (!AppServices.IsInitialized)
        {
            return false;
        }

        try
        {
            var coordinator = AppServices.GetRequired<AgentSearchIndexCoordinator>();
            coordinator.ScheduleBuild(SearchRegion.SubProgram);
            if (!coordinator.IsReady(SearchRegion.SubProgram))
            {
                return false;
            }

            var hub = AppServices.GetRequired<AgentSearchHub>();
            var hits = hub.Search(
                new SearchRequest
                {
                    Regions = new[] { SearchRegion.SubProgram },
                    Query = keyword,
                    Limit = limit,
                });
            foreach (var hit in hits)
            {
                AddRow(rows, hit);
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void TryAddDirectLookup(
        DataServiceSubProgramAccessor accessor,
        string key,
        Dictionary<string, Row> rows)
    {
        if (!accessor.TryGetByIdOrName(key, out var subProgram, out _) || subProgram is null)
        {
            return;
        }

        var id = (subProgram.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return;
        }

        var callIdentifier = DataServiceSubProgramAccessor.GetCallIdentifier(subProgram);
        rows[id] = new Row
        {
            Id = id,
            Name = subProgram.Name ?? string.Empty,
            Description = NullIfEmpty(subProgram.Description),
            CallIdentifier = callIdentifier,
            Score = 250,
        };
    }

    private static void AddRow(Dictionary<string, Row> rows, SearchHit hit)
    {
        var summary = SubProgramSearchLinear.MapHit(hit);
        var id = (summary.Id ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return;
        }

        var callIdentifier = (summary.CallIdentifier ?? summary.Name ?? id).Trim();
        rows[id] = new Row
        {
            Id = id,
            Name = summary.Name ?? string.Empty,
            Description = summary.Description,
            CallIdentifier = callIdentifier,
            Score = hit.Score,
        };
    }

    private static IReadOnlyList<Row> OrderRows(IEnumerable<Row> rows, int limit) =>
        rows
            .OrderByDescending(row => row.Score)
            .ThenBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();

    private static IEnumerable<string> EnumerateLookupKeys(string keyword)
    {
        var trimmed = keyword.Trim();
        if (trimmed.Length == 0)
        {
            yield break;
        }

        if (trimmed.StartsWith("@@", StringComparison.Ordinal))
        {
            yield return trimmed;
            yield break;
        }

        if (trimmed.Length >= 2 && trimmed[0] == '%' && trimmed[^1] == '%')
        {
            var inner = trimmed[1..^1].Trim();
            if (inner.Length > 0)
            {
                yield return inner;
            }
        }

        var withoutPercents = trimmed.Trim('%').Trim();
        if (withoutPercents.Length > 0 && !string.Equals(withoutPercents, trimmed, StringComparison.Ordinal))
        {
            yield return withoutPercents;
        }

        if (Guid.TryParse(trimmed, out _))
        {
            yield return trimmed;
        }

        var guidNoDash = trimmed.Replace("-", string.Empty);
        if (guidNoDash.Length == 32
            && Guid.TryParse(InsertGuidDashes(guidNoDash), out var parsed))
        {
            yield return parsed.ToString("D");
        }
    }

    private static string InsertGuidDashes(string compact32)
    {
        if (compact32.Length != 32)
        {
            return compact32;
        }

        return compact32.Substring(0, 8) + "-"
            + compact32.Substring(8, 4) + "-"
            + compact32.Substring(12, 4) + "-"
            + compact32.Substring(16, 4) + "-"
            + compact32.Substring(20, 12);
    }

    private static int NormalizeLimit(int maxCount)
    {
        if (maxCount < 1)
        {
            return 1;
        }

        return maxCount > 100 ? 100 : maxCount;
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
