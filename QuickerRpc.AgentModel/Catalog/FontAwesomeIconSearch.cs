using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>In-memory Font Awesome icon search (normalize + score).</summary>
public static class FontAwesomeIconSearch
{
    public const int DefaultLimit = 40;
    public const int MaxLimit = 200;

    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var span = value.AsSpan().Trim();
        var buffer = new char[span.Length];
        var n = 0;
        foreach (var ch in span)
        {
            if (ch is ' ' or '-' or '_' or ':')
            {
                continue;
            }

            buffer[n++] = char.ToLowerInvariant(ch);
        }

        return n == 0 ? string.Empty : new string(buffer, 0, n);
    }

    public static int ClampLimit(int? maxResults)
    {
        if (maxResults is null or <= 0)
        {
            return DefaultLimit;
        }

        return Math.Min(maxResults.Value, MaxLimit);
    }

    public static SearchFontAwesomeIconsResult Search(
        IReadOnlyList<FontAwesomeIconEntry> catalog,
        string? query,
        int? maxResults,
        bool expand = false)
    {
        var limit = ClampLimit(maxResults);
        var kw = (query ?? string.Empty).Trim();

        List<(FontAwesomeIconEntry Entry, int Score)> ranked;
        if (kw.Length == 0)
        {
            ranked = catalog
                .OrderBy(e => e.Name, StringComparer.OrdinalIgnoreCase)
                .Select(e => (e, 0))
                .ToList();
        }
        else
        {
            FontAwesomeIconSearchIndex.EnsurePublished(catalog);
            ranked = FontAwesomeIconSearchIndex
                .Search(kw, limit: int.MaxValue)
                .Take(MaxLimit)
                .Select(hit => ((FontAwesomeIconEntry)hit.Payload!, hit.Score))
                .ToList();
        }

        List<string> names;
        if (expand)
        {
            names = ranked.Take(limit).Select(x => x.Entry.Name).ToList();
        }
        else
        {
            names = FontAwesomeIconDedup.CollapseToEnumNames(ranked, limit);
        }

        return new SearchFontAwesomeIconsResult
        {
            Success = true,
            Keyword = kw.Length == 0 ? null : kw,
            MatchCount = names.Count,
            Names = names,
            DefaultStyle = FontAwesomeIconDedup.DefaultStyle,
        };
    }

    /// <summary>Legacy single-pattern score (tests and simple callers).</summary>
    public static int ComputeScore(FontAwesomeIconEntry entry, string normalizedQuery)
    {
        if (normalizedQuery.Length == 0)
        {
            return 0;
        }

        var nameNorm = Normalize(entry.Name);
        var labelNorm = Normalize(entry.Label);
        var iconNorm = Normalize(entry.Icon);
        var styleNorm = Normalize(entry.Style);

        if (nameNorm == normalizedQuery || iconNorm == normalizedQuery)
        {
            return 200;
        }

        if (labelNorm == normalizedQuery)
        {
            return 150;
        }

        if (nameNorm.StartsWith(normalizedQuery, StringComparison.Ordinal))
        {
            return 120;
        }

        if (labelNorm.StartsWith(normalizedQuery, StringComparison.Ordinal))
        {
            return 100;
        }

        if (nameNorm.Contains(normalizedQuery, StringComparison.Ordinal))
        {
            return 80;
        }

        if (labelNorm.Contains(normalizedQuery, StringComparison.Ordinal))
        {
            return 60;
        }

        if (styleNorm.Length > 0
            && normalizedQuery.StartsWith(styleNorm, StringComparison.Ordinal)
            && nameNorm.Contains(normalizedQuery, StringComparison.Ordinal))
        {
            return 70;
        }

        return 0;
    }
}
