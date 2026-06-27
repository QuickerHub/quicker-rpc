using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Loads embedded <c>quicker-settings-agent-keywords.json</c> for settings retrieval.</summary>
public static class QuickerSettingsAgentKeywordCatalog
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.quicker-settings-agent-keywords.json";

    private static readonly Lazy<IReadOnlyDictionary<string, QuickerSettingsAgentKeywordEntry>> Entries =
        new(LoadEntries);

    public static bool TryGet(string settingKey, out QuickerSettingsAgentKeywordEntry entry)
    {
        var key = (settingKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            entry = new QuickerSettingsAgentKeywordEntry();
            return false;
        }

        return Entries.Value.TryGetValue(key, out entry!);
    }

    public static IReadOnlyDictionary<string, QuickerSettingsAgentKeywordEntry> All => Entries.Value;

    private static IReadOnlyDictionary<string, QuickerSettingsAgentKeywordEntry> LoadEntries()
    {
        var assembly = typeof(QuickerSettingsAgentKeywordCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            return new Dictionary<string, QuickerSettingsAgentKeywordEntry>(StringComparer.Ordinal);
        }

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var raw = JsonSerializer.Deserialize<Dictionary<string, QuickerSettingsAgentKeywordEntry>>(json);
        if (raw is null || raw.Count == 0)
        {
            return new Dictionary<string, QuickerSettingsAgentKeywordEntry>(StringComparer.Ordinal);
        }

        var map = new Dictionary<string, QuickerSettingsAgentKeywordEntry>(raw.Count, StringComparer.Ordinal);
        foreach (var pair in raw)
        {
            var key = (pair.Key ?? string.Empty).Trim();
            if (key.Length == 0)
            {
                continue;
            }

            map[key] = pair.Value ?? new QuickerSettingsAgentKeywordEntry();
        }

        return map;
    }
}
