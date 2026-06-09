using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Search;

/// <summary>Parsed query: legacy whitespace-AND or advanced | OR with optional * wildcards.</summary>
public sealed class SearchQuery
{
    private static readonly char[] BranchSeparators = { '|' };
    private static readonly char[] TokenSeparators = { ' ', '\t' };

    public bool IsAdvanced { get; set; }

    public string[] LegacyPatterns { get; set; } = Array.Empty<string>();

    public string[][] Branches { get; set; } = Array.Empty<string[]>();

    public bool IsEmpty =>
        !IsAdvanced && LegacyPatterns.Length == 0
        || IsAdvanced && Branches.Length == 0;

    public static SearchQuery Parse(string? keyword)
    {
        var raw = SearchTokenizer.NormalizeQuery(keyword);
        if (raw.Length == 0)
        {
            return new SearchQuery();
        }

        var useAdvanced = raw.IndexOf('|') >= 0 || raw.IndexOf('*') >= 0;
        if (!useAdvanced)
        {
            return new SearchQuery
            {
                IsAdvanced = false,
                LegacyPatterns = SplitLegacyPatterns(raw),
            };
        }

        var branches = new List<string[]>();
        foreach (var branchRaw in raw.Split(BranchSeparators, StringSplitOptions.RemoveEmptyEntries))
        {
            var tokens = branchRaw
                .Split(TokenSeparators, StringSplitOptions.RemoveEmptyEntries)
                .Select(t => t.Trim())
                .Where(t => t.Length > 0)
                .ToArray();
            if (tokens.Length > 0)
            {
                branches.Add(tokens);
            }
        }

        return branches.Count == 0
            ? new SearchQuery()
            : new SearchQuery { IsAdvanced = true, Branches = branches.ToArray() };
    }

    private static string[] SplitLegacyPatterns(string keyword) =>
        keyword
            .Split(TokenSeparators, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .Select(p => p.ToLowerInvariant())
            .ToArray();
}
