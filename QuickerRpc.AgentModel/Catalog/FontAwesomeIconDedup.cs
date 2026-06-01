using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Collapse Solid/Regular/Light/… variants of the same glyph; Brands stay one row per enum name.
/// </summary>
public static class FontAwesomeIconDedup
{
    private static readonly Dictionary<string, int> StyleRank = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Solid"] = 0,
        ["Regular"] = 1,
        ["Light"] = 2,
        ["Thin"] = 3,
        ["Duotone"] = 4,
    };

    public static string GetGroupKey(FontAwesomeIconEntry entry)
    {
        var name = entry.Name ?? string.Empty;
        if (name.StartsWith("Brands_", StringComparison.Ordinal)
            || string.Equals(entry.Style, "Brands", StringComparison.OrdinalIgnoreCase))
        {
            return "brand:" + name;
        }

        var labelKey = FontAwesomeIconSearch.Normalize(entry.Label);
        if (labelKey.Length > 0)
        {
            return "glyph:" + labelKey;
        }

        var baseName = GetGlyphBaseName(name);
        return "glyph:" + (baseName.Length > 0 ? baseName : name.ToLowerInvariant());
    }

    public static int GetStyleRank(FontAwesomeIconEntry entry) =>
        StyleRank.TryGetValue(entry.Style ?? string.Empty, out var rank) ? rank : 100;

    /// <summary>One enum name per glyph; prefers Solid over Regular/Light when scores tie.</summary>
    public static List<string> CollapseToEnumNames(
        IEnumerable<(FontAwesomeIconEntry Entry, int Score)> ranked,
        int limit)
    {
        var groupPick = new Dictionary<string, (FontAwesomeIconEntry Entry, int Score)>(StringComparer.Ordinal);
        foreach (var (entry, score) in ranked)
        {
            var key = GetGroupKey(entry);
            if (!groupPick.TryGetValue(key, out var current))
            {
                groupPick[key] = (entry, score);
                continue;
            }

            if (score > current.Score
                || (score == current.Score && GetStyleRank(entry) < GetStyleRank(current.Entry)))
            {
                groupPick[key] = (entry, score);
            }
        }

        return groupPick.Values
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Entry.Name, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .Select(x => x.Entry.Name)
            .ToList();
    }

    private static string GetGlyphBaseName(string enumName)
    {
        var idx = enumName.IndexOf('_');
        return idx < 0 || idx >= enumName.Length - 1
            ? enumName
            : enumName.Substring(idx + 1);
    }
}
