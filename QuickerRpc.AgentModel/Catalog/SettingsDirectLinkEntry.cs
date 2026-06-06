using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Preset direct link for one-step <c>settings open --preset</c>.</summary>
public sealed class SettingsDirectLinkEntry
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("aliases")]
    public List<string> Aliases { get; set; } = new();

    [JsonPropertyName("requiresExe")]
    public bool RequiresExe { get; set; }

    [JsonPropertyName("defaultExe")]
    public string? DefaultExe { get; set; }
}
