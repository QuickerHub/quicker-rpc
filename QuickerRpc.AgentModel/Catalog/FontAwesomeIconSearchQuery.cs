using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Parsed FA icon search: whitespace-AND, or <c>|</c> (OR) and <c>*</c> (wildcard).
/// </summary>
public sealed class FontAwesomeIconSearchQuery
{
    private static readonly char[] BranchSeparators = { '|' };
    private static readonly char[] TokenSeparators = { ' ', '\t' };

    public bool IsAdvanced { get; set; }

    public string[] LegacyPatterns { get; set; } = Array.Empty<string>();

    public string[][] Branches { get; set; } = Array.Empty<string[]>();

    public static FontAwesomeIconSearchQuery Parse(string? keyword)
    {
        var raw = (keyword ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return new FontAwesomeIconSearchQuery();
        }

        var useAdvanced = raw.IndexOf('|') >= 0 || raw.IndexOf('*') >= 0;
        if (!useAdvanced)
        {
            return new FontAwesomeIconSearchQuery
            {
                IsAdvanced = false,
                LegacyPatterns = SplitLegacyPatterns(raw),
            };
        }

        var branchStrings = raw.Split(BranchSeparators, StringSplitOptions.RemoveEmptyEntries);
        var branches = new List<string[]>();
        foreach (var branchRaw in branchStrings)
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

        if (branches.Count == 0)
        {
            return new FontAwesomeIconSearchQuery();
        }

        return new FontAwesomeIconSearchQuery
        {
            IsAdvanced = true,
            Branches = branches.ToArray(),
        };
    }

    public static bool RowMatches(FontAwesomeIconEntry entry, FontAwesomeIconSearchQuery query)
    {
        if (query.IsAdvanced)
        {
            if (query.Branches.Length == 0)
            {
                return true;
            }

            return query.Branches.Any(branch => BranchMatches(entry, branch));
        }

        return LegacyRowMatches(entry, query.LegacyPatterns);
    }

    public static int ComputeSortScore(FontAwesomeIconEntry entry, FontAwesomeIconSearchQuery query)
    {
        if (!query.IsAdvanced)
        {
            return LegacyComputeSortScore(entry, query.LegacyPatterns);
        }

        if (query.Branches.Length == 0)
        {
            return 0;
        }

        var best = int.MinValue;
        foreach (var branch in query.Branches)
        {
            if (!BranchMatches(entry, branch))
            {
                continue;
            }

            var legacyBranch = branch
                .Select(t => t.ToLowerInvariant())
                .Where(t => t.Length > 0)
                .ToArray();
            var score = LegacyComputeSortScore(entry, legacyBranch);
            if (score > best)
            {
                best = score;
            }
        }

        return best;
    }

    private static string[] SplitLegacyPatterns(string keyword) =>
        keyword
            .Split(TokenSeparators, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .Select(p => p.ToLowerInvariant())
            .ToArray();

    private static string GetMatchSurface(FontAwesomeIconEntry entry) =>
        string.Join(
            "\n",
            entry.Name,
            entry.Label,
            entry.Style,
            entry.Icon);

    private static bool LegacyRowMatches(FontAwesomeIconEntry entry, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        var surface = GetMatchSurface(entry).ToLowerInvariant();
        return patterns.All(p => surface.IndexOf(p, StringComparison.Ordinal) >= 0);
    }

    private static int LegacyComputeSortScore(FontAwesomeIconEntry entry, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return 0;
        }

        var score = 0;
        var nameLower = (entry.Name ?? string.Empty).ToLowerInvariant();
        var labelLower = (entry.Label ?? string.Empty).ToLowerInvariant();
        var iconLower = (entry.Icon ?? string.Empty).ToLowerInvariant();
        foreach (var p in patterns)
        {
            if (nameLower.IndexOf(p, StringComparison.Ordinal) >= 0
                || iconLower.IndexOf(p, StringComparison.Ordinal) >= 0)
            {
                score += 8;
            }

            if (labelLower.IndexOf(p, StringComparison.Ordinal) >= 0)
            {
                score += 4;
            }

            if ((entry.Style ?? string.Empty).IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                score += 2;
            }
        }

        return score;
    }

    private static bool BranchMatches(FontAwesomeIconEntry entry, string[] branchTokens)
    {
        if (branchTokens.Length == 0)
        {
            return true;
        }

        var surface = GetMatchSurface(entry);
        if (string.IsNullOrEmpty(surface))
        {
            return false;
        }

        foreach (var token in branchTokens)
        {
            if (!TokenMatches(surface, token))
            {
                return false;
            }
        }

        return true;
    }

    private static bool TokenMatches(string surface, string token)
    {
        if (token.Length == 0)
        {
            return true;
        }

        if (token.IndexOf('*') < 0)
        {
            return surface.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        try
        {
            var regexBody = Regex.Escape(token).Replace("\\*", ".*");
            return Regex.IsMatch(surface, regexBody, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        }
        catch (ArgumentException)
        {
            return false;
        }
    }
}
