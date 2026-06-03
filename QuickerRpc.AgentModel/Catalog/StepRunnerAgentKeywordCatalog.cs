using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Loads embedded <c>step-runner-agent-keywords.json</c> for agent retrieval.</summary>
public static class StepRunnerAgentKeywordCatalog
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.step-runner-agent-keywords.json";

    private static readonly Lazy<IReadOnlyDictionary<string, StepRunnerAgentKeywordEntry>> Entries =
        new(LoadEntries);

    public static bool TryGet(string stepRunnerKey, out StepRunnerAgentKeywordEntry entry)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            entry = new StepRunnerAgentKeywordEntry();
            return false;
        }

        return Entries.Value.TryGetValue(key, out entry!);
    }

    public static IReadOnlyDictionary<string, StepRunnerAgentKeywordEntry> All => Entries.Value;

    private static IReadOnlyDictionary<string, StepRunnerAgentKeywordEntry> LoadEntries()
    {
        var assembly = typeof(StepRunnerAgentKeywordCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            throw new InvalidOperationException("Missing embedded resource: " + ResourceName);
        }

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var raw = JsonSerializer.Deserialize<Dictionary<string, StepRunnerAgentKeywordEntry>>(json);
        if (raw is null || raw.Count == 0)
        {
            throw new InvalidOperationException("step-runner-agent-keywords.json is empty or invalid.");
        }

        var map = new Dictionary<string, StepRunnerAgentKeywordEntry>(raw.Count, StringComparer.Ordinal);
        foreach (var pair in raw)
        {
            var key = (pair.Key ?? string.Empty).Trim();
            if (key.Length == 0)
            {
                continue;
            }

            map[key] = pair.Value ?? new StepRunnerAgentKeywordEntry();
        }

        return map;
    }
}
