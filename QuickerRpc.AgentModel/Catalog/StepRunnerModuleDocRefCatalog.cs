using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Loads embedded <c>step-module-doc-refs.json</c> for agent doc lookup hints.</summary>
public static class StepRunnerModuleDocRefCatalog
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.step-module-doc-refs.json";

    private static readonly Lazy<IReadOnlyDictionary<string, StepRunnerModuleDocReference>> Refs =
        new(LoadRefs);

    public static bool TryGet(string stepRunnerKey, out StepRunnerModuleDocReference reference)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            reference = new StepRunnerModuleDocReference();
            return false;
        }

        return Refs.Value.TryGetValue(key, out reference!);
    }

    private static IReadOnlyDictionary<string, StepRunnerModuleDocReference> LoadRefs()
    {
        var assembly = typeof(StepRunnerModuleDocRefCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            return new Dictionary<string, StepRunnerModuleDocReference>(StringComparer.Ordinal);
        }

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var envelope = JsonSerializer.Deserialize<StepRunnerModuleDocRefEnvelope>(json, options);
        var raw = envelope?.Refs;
        if (raw is null || raw.Count == 0)
        {
            return new Dictionary<string, StepRunnerModuleDocReference>(StringComparer.Ordinal);
        }

        var map = new Dictionary<string, StepRunnerModuleDocReference>(raw.Count, StringComparer.Ordinal);
        foreach (var pair in raw)
        {
            var key = (pair.Key ?? string.Empty).Trim();
            var value = pair.Value;
            if (key.Length == 0 || value is null || string.IsNullOrWhiteSpace(value.File))
            {
                continue;
            }

            map[key] = new StepRunnerModuleDocReference
            {
                Topic = string.IsNullOrWhiteSpace(value.Topic) ? "step-modules" : value.Topic.Trim(),
                File = value.File.Trim(),
                Tier = TrimToNull(value.Tier),
            };
        }

        return map;
    }

    private static string? TrimToNull(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private sealed class StepRunnerModuleDocRefEnvelope
    {
        public Dictionary<string, StepRunnerModuleDocRefEntry>? Refs { get; set; }
    }

    private sealed class StepRunnerModuleDocRefEntry
    {
        public string? Topic { get; set; }

        public string? File { get; set; }

        public string? Tier { get; set; }
    }
}
