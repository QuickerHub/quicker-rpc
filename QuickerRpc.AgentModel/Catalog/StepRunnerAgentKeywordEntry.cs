using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Curated agent-facing keywords, hints, and search rank weights.</summary>
public sealed class StepRunnerAgentKeywordEntry
{
    [JsonPropertyName("keywords")]
    public List<string> Keywords { get; set; } = new();

    [JsonPropertyName("notFor")]
    public List<string> NotFor { get; set; } = new();

    /// <summary>
    /// Hide this module from agent <c>step-runner search</c> (browse and keyword). <c>get</c> unchanged.
    /// </summary>
    [JsonPropertyName("obsolete")]
    public bool Obsolete { get; set; }

    /// <summary>
    /// Control selection values hidden from search match/ranking (<c>SelectionItem.Value</c>).
    /// </summary>
    [JsonPropertyName("obsoleteControlValues")]
    public List<string> ObsoleteControlValues { get; set; } = new();

    [JsonPropertyName("snippet")]
    public string? Snippet { get; set; }

    /// <summary>
    /// Fixed sort bias for this module (negative = deprioritize in search results).
    /// Applied after keyword match scoring.
    /// </summary>
    [JsonPropertyName("rankBias")]
    public int RankBias { get; set; }

    /// <summary>
    /// Per control-field selection value bias (key = <c>SelectionItem.Value</c>).
    /// </summary>
    [JsonPropertyName("controlRankBias")]
    public Dictionary<string, int> ControlRankBias { get; set; } = new();

    /// <summary>
    /// Per control-field selection keywords (key = <c>SelectionItem.Value</c>).
    /// Used for search match/ranking on that mode only; keep module <see cref="Keywords"/> generic.
    /// </summary>
    [JsonPropertyName("controlKeywords")]
    public Dictionary<string, List<string>> ControlKeywords { get; set; } = new();
}
