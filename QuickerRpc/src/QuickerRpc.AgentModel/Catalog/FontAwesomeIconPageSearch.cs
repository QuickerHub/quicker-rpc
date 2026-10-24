using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace QuickerRpc.AgentModel.Catalog;

public sealed class FontAwesomeIconPage
{
    public IReadOnlyList<string> Names { get; set; } = Array.Empty<string>();
    public int TotalCount { get; set; }
    public int Skip { get; set; }
    public int Take { get; set; }
    public bool HasMore { get; set; }
    public string Query { get; set; } = string.Empty;
    public string? Style { get; set; }
}

/// <summary>
/// Portable readonly counterpart of QuickerPc/Quicker.Headless/Designer/Plugin/
/// FaIconListView.cs and FaIconSearchMatch.cs. The embedded fa-icon-chinese-keywords.json
/// is the corresponding Resources/FaIconChineseKeywords.json snapshot from that source.
/// Source snapshot: Quicker commit 378d8e4fce1e3e40604924fbec8991f1be18a7d9.
/// No process-wide criteria/catalog cache: each caller supplies its own sorted native catalog.
/// Legacy FontAwesomeIconSearch has an independent contract and is intentionally unchanged.
/// </summary>
public static class FontAwesomeIconPageSearch
{
    private const string ResourceName = "QuickerRpc.AgentModel.Catalog.fa-icon-chinese-keywords.json";
    private static readonly Regex PascalSplit = new(@"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", RegexOptions.CultureInvariant);
    private static readonly Lazy<IReadOnlyDictionary<string, string>> Keywords = new(LoadKeywords, isThreadSafe: true);

    public static bool IsKeywordResourceAvailable => typeof(FontAwesomeIconPageSearch).Assembly.GetManifestResourceInfo(ResourceName) is not null;

    public static FontAwesomeIconPage Search(IReadOnlyList<string> catalog, string? query, string? style, int skip = 0, int take = 96)
    {
        if (catalog is null) throw new ArgumentNullException(nameof(catalog));
        var keyword = (query ?? string.Empty).Trim();
        var prefix = (style ?? string.Empty).Trim();
        if (prefix.Equals("Brand", StringComparison.OrdinalIgnoreCase)) prefix = "Brands";
        var start = Math.Max(0, skip);
        var count = take <= 0 ? 96 : Math.Min(take, 300);
        var rows = catalog.Select((name, index) => (Name: name, Index: index));
        if (prefix.Length > 0) rows = rows.Where(row => row.Name.StartsWith(prefix + "_", StringComparison.OrdinalIgnoreCase));
        string[] materialized;
        if (keyword.Length == 0)
        {
            materialized = prefix.Length == 0 ? rows.OrderBy(row => IsBrand(row.Name) ? 1 : 0).ThenBy(row => row.Index).Select(row => row.Name).ToArray()
                : rows.Select(row => row.Name).ToArray();
        }
        else
        {
            var scored = rows.Select(row => (row.Name, row.Index, Score: Score(row.Name, keyword))).Where(row => row.Score > 0);
            materialized = prefix.Length == 0 ? scored.OrderByDescending(row => row.Score).ThenBy(row => IsBrand(row.Name) ? 1 : 0).ThenBy(row => row.Index).Select(row => row.Name).ToArray()
                : scored.OrderByDescending(row => row.Score).ThenBy(row => row.Index).Select(row => row.Name).ToArray();
        }
        var page = materialized.Skip(start).Take(count).ToArray();
        return new() { Names = page, TotalCount = materialized.Length, Skip = start, Take = count,
            HasMore = (long)start + page.Length < materialized.Length, Query = keyword, Style = prefix.Length == 0 ? null : prefix };
    }

    public static int Score(string iconEnumName, string? query)
    {
        var tokens = Tokens(query);
        if (tokens.Length == 0 || string.IsNullOrEmpty(iconEnumName)) return 0;
        var underscore = iconEnumName.IndexOf('_');
        var body = underscore >= 0 ? iconEnumName.Substring(underscore + 1) : iconEnumName;
        var parts = Tokens(PascalSplit.Replace(body.TrimStart('_'), " "));
        var chinese = Tokens(Keywords.Value.TryGetValue(body, out var keywords) ? keywords : string.Empty);
        var sum = 0; var matched = 0;
        foreach (var token in tokens)
        {
            var best = EqualsToken(body, token) ? 100 : StartsWith(body, token) ? 70 : Contains(body, token) ? 50 : 0;
            if (Contains(iconEnumName, token)) best = Math.Max(best, 40);
            foreach (var part in parts)
                best = Math.Max(best, EqualsToken(part, token) ? 65 : Contains(part, token) || Contains(token, part) ? 45 : 0);
            foreach (var word in chinese)
                best = Math.Max(best, EqualsToken(word, token) ? 80 : Contains(word, token) ? 60 : Contains(token, word) ? Math.Min(55, 20 + 10 * word.Length) : 0);
            if (best > 0) { matched++; sum += best; }
        }
        var coverage = (double)matched / tokens.Length;
        return matched == 0 || sum <= 0 ? 0 : Math.Max(1, (int)Math.Round(sum * (0.4 + 0.6 * coverage)));
    }

    private static string[] Tokens(string? value) => string.IsNullOrWhiteSpace(value) ? Array.Empty<string>()
        : value!.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Select(token => token.Trim()).Where(token => token.Length > 0).ToArray();
    private static bool EqualsToken(string value, string token) => value.Length > 0 && value.Equals(token, StringComparison.OrdinalIgnoreCase);
    private static bool StartsWith(string value, string token) => value.Length > 0 && value.StartsWith(token, StringComparison.OrdinalIgnoreCase);
    private static bool Contains(string value, string token) => value.Length > 0 && token.Length > 0 && value.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;
    private static bool IsBrand(string value) => value.StartsWith("Brands_", StringComparison.OrdinalIgnoreCase) || value.StartsWith("Brand_", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyDictionary<string, string> LoadKeywords()
    {
        using var stream = typeof(FontAwesomeIconPageSearch).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidDataException("Font Awesome paging keyword resource is unavailable.");
        using var reader = new StreamReader(stream);
        var values = JsonConvert.DeserializeObject<Dictionary<string, string>>(reader.ReadToEnd());
        if (values is null || values.Count == 0) throw new InvalidDataException("Font Awesome paging keyword resource is empty or invalid.");
        return new Dictionary<string, string>(values, StringComparer.Ordinal);
    }
}
