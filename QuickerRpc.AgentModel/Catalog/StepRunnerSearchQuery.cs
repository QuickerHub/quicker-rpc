using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Parsed step-runner search: legacy whitespace-AND, or advanced <c>|</c> (OR) and <c>*</c> (wildcard).
/// Step-runner keyword parser: legacy AND, or | OR and * wildcards.
/// </summary>
public sealed class StepRunnerSearchQuery
{
    private static readonly char[] BranchSeparators = { '|' };
    private static readonly char[] TokenSeparators = { ' ', '\t' };

    public bool IsAdvanced { get; set; }

    public string[] LegacyPatterns { get; set; } = Array.Empty<string>();

    public string[][] Branches { get; set; } = Array.Empty<string[]>();

    public static StepRunnerSearchQuery Parse(string? keyword)
    {
        var raw = (keyword ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return new StepRunnerSearchQuery();
        }

        var useAdvanced = raw.IndexOf('|') >= 0 || raw.IndexOf('*') >= 0;
        if (!useAdvanced)
        {
            return new StepRunnerSearchQuery
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
            return new StepRunnerSearchQuery();
        }

        return new StepRunnerSearchQuery
        {
            IsAdvanced = true,
            Branches = branches.ToArray(),
        };
    }

    public static bool RowMatches(StepRunnerDefinition row, StepRunnerSearchQuery query)
    {
        if (query.IsAdvanced)
        {
            if (query.Branches.Length == 0)
            {
                return true;
            }

            return query.Branches.Any(branch => BranchMatches(row, branch));
        }

        return LegacyRowMatches(row, query.LegacyPatterns);
    }

    public static int ComputeSortScore(StepRunnerDefinition row, StepRunnerSearchQuery query)
    {
        if (!query.IsAdvanced)
        {
            return LegacyComputeSortScore(row, query.LegacyPatterns);
        }

        if (query.Branches.Length == 0)
        {
            return 0;
        }

        var best = int.MinValue;
        foreach (var branch in query.Branches)
        {
            if (!BranchMatches(row, branch))
            {
                continue;
            }

            var legacyBranch = branch
                .Select(t => t.ToLowerInvariant())
                .Where(t => t.Length > 0)
                .ToArray();
            var score = LegacyComputeSortScore(row, legacyBranch);
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

    private static string GetMatchSurface(StepRunnerDefinition row) =>
        string.Join(
            "\n",
            row.Key,
            row.Name,
            row.Description,
            row.Category);

    private static bool LegacyRowMatches(StepRunnerDefinition row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        var surface = GetMatchSurface(row).ToLowerInvariant();
        return patterns.All(p => surface.IndexOf(p, StringComparison.Ordinal) >= 0);
    }

    private static int LegacyComputeSortScore(StepRunnerDefinition row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return 0;
        }

        var score = 0;
        var keyLower = (row.Key ?? string.Empty).ToLowerInvariant();
        var nameLower = (row.Name ?? string.Empty).ToLowerInvariant();
        foreach (var p in patterns)
        {
            if (keyLower.IndexOf(p, StringComparison.Ordinal) >= 0)
            {
                score += 8;
            }

            if (nameLower.IndexOf(p, StringComparison.Ordinal) >= 0)
            {
                score += 4;
            }

            if ((row.Description ?? string.Empty).IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                score += 1;
            }
        }

        return score;
    }

    private static bool BranchMatches(StepRunnerDefinition row, string[] branchTokens)
    {
        if (branchTokens.Length == 0)
        {
            return true;
        }

        var surface = GetMatchSurface(row);
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
