using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Normalized searchable row stored in a region index.</summary>
public sealed class SearchDocument
{
    public string Id { get; set; } = string.Empty;

    public SearchRegion Region { get; set; }

    /// <summary>Logical field name → searchable text (e.g. title, body, key).</summary>
    public IReadOnlyDictionary<string, string> Fields { get; set; } =
        new Dictionary<string, string>();

    public int RankBias { get; set; }

    /// <summary>Stable title for empty-query ordering.</summary>
    public string SortKey { get; set; } = string.Empty;

    /// <summary>Domain object or DTO returned to callers.</summary>
    public object? Payload { get; set; }
}
