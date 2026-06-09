using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Search;

/// <summary>
/// Unified in-memory search hub: publish region snapshots at startup/warmup, query across partitions.
/// </summary>
public sealed class AgentSearchHub
{
    private readonly object _sync = new();
    private readonly Dictionary<SearchRegion, SearchRegionSnapshot> _regions = new();

    public bool IsPublished(SearchRegion region)
    {
        lock (_sync)
        {
            return _regions.ContainsKey(region);
        }
    }

    public void Publish(
        SearchRegion region,
        IReadOnlyList<SearchDocument> documents,
        SearchRegionMode mode,
        SearchFieldWeights? fieldWeights = null,
        SearchLinearScorer? linearScorer = null)
    {
        if (documents is null)
        {
            throw new ArgumentNullException(nameof(documents));
        }

        var snapshot = SearchRegionSnapshot.Build(
            region,
            documents,
            mode,
            fieldWeights,
            linearScorer);

        lock (_sync)
        {
            _regions[region] = snapshot;
        }
    }

    public void Invalidate(SearchRegion region)
    {
        lock (_sync)
        {
            _regions.Remove(region);
        }
    }

    public void InvalidateAll()
    {
        lock (_sync)
        {
            _regions.Clear();
        }
    }

    public IReadOnlyList<SearchHit> Search(SearchRequest request)
    {
        if (request is null)
        {
            throw new ArgumentNullException(nameof(request));
        }

        var regions = request.Regions is { Count: > 0 }
            ? request.Regions
            : new[] { SearchRegion.SubProgram };

        var merged = new List<SearchHit>();
        SearchRegionSnapshot[] snapshots;
        lock (_sync)
        {
            snapshots = regions
                .Where(_regions.ContainsKey)
                .Select(r => _regions[r])
                .ToArray();
        }

        foreach (var snapshot in snapshots)
        {
            merged.AddRange(snapshot.Search(request));
        }

        return merged
            .OrderByDescending(h => h.Score)
            .ThenBy(h => h.SortKey, StringComparer.OrdinalIgnoreCase)
            .Take(ClampLimit(request.Limit))
            .ToList();
    }

    public static int ClampLimit(int limit)
    {
        if (limit < 1)
        {
            return 1;
        }

        return limit > 200 ? 200 : limit;
    }
}
