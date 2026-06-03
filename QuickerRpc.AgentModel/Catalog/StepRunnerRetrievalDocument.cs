using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Agent retrieval chunk for one step-runner (search/RAG recall).</summary>
public sealed class StepRunnerRetrievalDocument
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Category { get; set; } = string.Empty;

    public IReadOnlyList<string> AgentKeywords { get; set; } = new List<string>();

    public IReadOnlyList<string> NotFor { get; set; } = new List<string>();

    public string? Snippet { get; set; }

    public int RankBias { get; set; }

    public IReadOnlyDictionary<string, int> ControlRankBias { get; set; } =
        new Dictionary<string, int>(System.StringComparer.Ordinal);

    /// <summary>Lowercased searchable blob (key, names, keywords, control modes).</summary>
    public string SearchableText { get; set; } = string.Empty;
}
