using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Curated agent-facing metadata for Quicker settings retrieval.</summary>
public sealed class QuickerSettingsAgentKeywordEntry
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("keywords")]
    public List<string> Keywords { get; set; } = new();

    [JsonPropertyName("snippet")]
    public string? Snippet { get; set; }

    [JsonPropertyName("pageId")]
    public string? PageId { get; set; }

    /// <summary>page | setting (default setting).</summary>
    [JsonPropertyName("kind")]
    public string? Kind { get; set; }

    /// <summary>Fixed sort bias (negative = deprioritize).</summary>
    [JsonPropertyName("rankBias")]
    public int RankBias { get; set; }

    /// <summary>CLI/RPC aliases for settings open (e.g. recycle-bin).</summary>
    [JsonPropertyName("openAliases")]
    public List<string> OpenAliases { get; set; } = new();
}
