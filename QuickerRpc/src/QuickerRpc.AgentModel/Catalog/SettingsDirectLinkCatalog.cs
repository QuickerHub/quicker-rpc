using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Embedded preset links for one-step settings UI open.</summary>
public static class SettingsDirectLinkCatalog
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.settings-direct-links.json";

    private static readonly Lazy<CatalogSnapshot> Snapshot = new(LoadSnapshot);

    public static IReadOnlyList<SettingsDirectLinkListItem> ListLinks() => Snapshot.Value.Links;

    public static bool TryResolve(string? presetOrAlias, out SettingsDirectLinkResolved resolved)
    {
        resolved = default;
        var text = (presetOrAlias ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return false;
        }

        if (!Snapshot.Value.ByKey.TryGetValue(text, out var item))
        {
            return false;
        }

        resolved = new SettingsDirectLinkResolved(
            item.Id,
            item.Title,
            item.Target,
            item.RequiresExe,
            item.DefaultExe);
        return true;
    }

    private static CatalogSnapshot LoadSnapshot()
    {
        var assembly = typeof(SettingsDirectLinkCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            return new CatalogSnapshot(Array.Empty<SettingsDirectLinkListItem>(), new Dictionary<string, SettingsDirectLinkListItem>());
        }

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var raw = JsonSerializer.Deserialize<Dictionary<string, SettingsDirectLinkEntry>>(json);
        if (raw is null || raw.Count == 0)
        {
            return new CatalogSnapshot(Array.Empty<SettingsDirectLinkListItem>(), new Dictionary<string, SettingsDirectLinkListItem>());
        }

        var links = new List<SettingsDirectLinkListItem>(raw.Count);
        var byKey = new Dictionary<string, SettingsDirectLinkListItem>(StringComparer.OrdinalIgnoreCase);

        foreach (var pair in raw.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
        {
            var id = (pair.Key ?? string.Empty).Trim();
            if (id.Length == 0 || pair.Value is null)
            {
                continue;
            }

            var target = (pair.Value.Target ?? string.Empty).Trim();
            if (target.Length == 0)
            {
                continue;
            }

            var item = new SettingsDirectLinkListItem(
                id,
                pair.Value.Title?.Trim() ?? id,
                target,
                pair.Value.RequiresExe,
                pair.Value.DefaultExe?.Trim(),
                pair.Value.Aliases
                    .Select(alias => alias.Trim())
                    .Where(alias => alias.Length > 0)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList());

            links.Add(item);
            byKey[id] = item;
            foreach (var alias in item.Aliases)
            {
                if (!byKey.ContainsKey(alias))
                {
                    byKey[alias] = item;
                }
            }
        }

        return new CatalogSnapshot(links, byKey);
    }

    private sealed class CatalogSnapshot
    {
        public CatalogSnapshot(
            IReadOnlyList<SettingsDirectLinkListItem> links,
            IReadOnlyDictionary<string, SettingsDirectLinkListItem> byKey)
        {
            Links = links;
            ByKey = byKey;
        }

        public IReadOnlyList<SettingsDirectLinkListItem> Links { get; }

        public IReadOnlyDictionary<string, SettingsDirectLinkListItem> ByKey { get; }
    }
}

public sealed class SettingsDirectLinkListItem
{
    public SettingsDirectLinkListItem(
        string id,
        string title,
        string target,
        bool requiresExe,
        string? defaultExe,
        IReadOnlyList<string> aliases)
    {
        Id = id;
        Title = title;
        Target = target;
        RequiresExe = requiresExe;
        DefaultExe = defaultExe;
        Aliases = aliases;
    }

    public string Id { get; }

    public string Title { get; }

    public string Target { get; }

    public bool RequiresExe { get; }

    public string? DefaultExe { get; }

    public IReadOnlyList<string> Aliases { get; }
}

public readonly struct SettingsDirectLinkResolved
{
    public SettingsDirectLinkResolved(
        string id,
        string title,
        string target,
        bool requiresExe,
        string? defaultExe)
    {
        Id = id;
        Title = title;
        Target = target;
        RequiresExe = requiresExe;
        DefaultExe = defaultExe;
    }

    public string Id { get; }

    public string Title { get; }

    public string Target { get; }

    public bool RequiresExe { get; }

    public string? DefaultExe { get; }
}
