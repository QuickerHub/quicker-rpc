using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

public sealed class SearchRequest
{
    public IReadOnlyList<SearchRegion> Regions { get; set; } = Array.Empty<SearchRegion>();

    public string? Query { get; set; }

    public int Limit { get; set; } = 30;

    public bool RequireAllLegacyTokens { get; set; } = true;

    /// <summary>When false, return every scored match (used before script re-sort).</summary>
    public bool LimitResults { get; set; } = true;

    public Func<SearchDocument, bool>? DocumentFilter { get; set; }
}