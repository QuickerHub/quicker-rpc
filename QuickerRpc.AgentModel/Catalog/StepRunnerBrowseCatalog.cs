using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.Json;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Curated common modules for empty <c>step-runner search</c> (browse).</summary>
public static class StepRunnerBrowseCatalog
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.step-runner-browse-modules.json";

    private static readonly Lazy<IReadOnlyList<string>> OrderedKeysLazy = new(LoadOrderedKeys);

    private static readonly Lazy<IReadOnlyDictionary<string, int>> IndexByKeyLazy =
        new(() => OrderedKeysLazy.Value
            .Select((key, index) => (key, index))
            .ToDictionary(x => x.key, x => x.index, StringComparer.OrdinalIgnoreCase));

    public static IReadOnlyList<string> OrderedKeys => OrderedKeysLazy.Value;

    public static bool Contains(string stepRunnerKey) =>
        IndexByKeyLazy.Value.ContainsKey((stepRunnerKey ?? string.Empty).Trim());

    public static int GetBrowseIndex(string stepRunnerKey)
    {
        var key = (stepRunnerKey ?? string.Empty).Trim();
        return IndexByKeyLazy.Value.TryGetValue(key, out var index) ? index : int.MaxValue;
    }

    private static IReadOnlyList<string> LoadOrderedKeys()
    {
        var assembly = typeof(StepRunnerBrowseCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException("Missing embedded resource: " + ResourceName);

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var raw = JsonSerializer.Deserialize<List<string>>(json);
        if (raw is null || raw.Count == 0)
        {
            throw new InvalidOperationException("step-runner-browse-modules.json is empty or invalid.");
        }

        var keys = new List<string>(raw.Count);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in raw)
        {
            var key = (entry ?? string.Empty).Trim();
            if (key.Length == 0 || !seen.Add(key))
            {
                continue;
            }

            keys.Add(key);
        }

        if (keys.Count == 0)
        {
            throw new InvalidOperationException("step-runner-browse-modules.json has no valid keys.");
        }

        return keys;
    }
}
