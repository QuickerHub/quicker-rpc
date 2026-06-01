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
    private static readonly Regex MatchNormalization = new(
        @"[\s\(\)（）\-_·•,，.。:：/\\]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public bool IsAdvanced { get; set; }

    public string[] LegacyPatterns { get; set; } = Array.Empty<string>();

    public string[][] Branches { get; set; } = Array.Empty<string[]>();

    public bool IsEmpty =>
        !IsAdvanced && LegacyPatterns.Length == 0
        || IsAdvanced && Branches.Length == 0;

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

    public static int ScoreControlSelectionMatch(
        string selectionName,
        string selectionValue,
        StepRunnerSearchQuery query)
    {
        if (query.IsEmpty)
        {
            return 0;
        }

        var surface = string.Join("\n", selectionName, selectionValue);
        if (query.IsAdvanced)
        {
            return query.Branches
                .Where(branch => BranchMatchesSurface(surface, branch))
                .Select(branch => LegacyComputeSortScoreSurface(surface, branch))
                .DefaultIfEmpty(0)
                .Max();
        }

        return LegacyRowMatchesSurface(surface, query.LegacyPatterns)
            ? LegacyComputeSortScoreSurface(surface, query.LegacyPatterns) + 6
            : 0;
    }

    private static string GetMatchSurface(StepRunnerDefinition row)
    {
        var parts = new List<string>
        {
            row.Key ?? string.Empty,
            row.Name ?? string.Empty,
            row.Description ?? string.Empty,
            row.Category ?? string.Empty
        };

        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        if (control is not null)
        {
            foreach (var si in control.SelectionItems)
            {
                parts.Add(si.Name ?? string.Empty);
                parts.Add(si.Value ?? string.Empty);
                parts.Add(si.Description ?? string.Empty);
            }
        }

        return string.Join("\n", parts);
    }

    private static bool LegacyRowMatches(StepRunnerDefinition row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        return LegacyRowMatchesSurface(GetMatchSurface(row), patterns);
    }

    public static string NormalizeMatchText(string? text)
    {
        var raw = (text ?? string.Empty).Trim().ToLowerInvariant();
        return raw.Length == 0 ? string.Empty : MatchNormalization.Replace(raw, string.Empty);
    }

    private static bool LegacyRowMatchesSurface(string surface, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        var lower = surface.ToLowerInvariant();
        var normalizedSurface = NormalizeMatchText(surface);
        return patterns.All(p =>
            lower.IndexOf(p, StringComparison.Ordinal) >= 0
            || (!string.IsNullOrEmpty(normalizedSurface)
                && normalizedSurface.IndexOf(NormalizeMatchText(p), StringComparison.Ordinal) >= 0));
    }

    private static int LegacyComputeSortScore(StepRunnerDefinition row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return 0;
        }

        return LegacyComputeSortScoreSurface(GetMatchSurface(row), patterns, row);
    }

    private static int LegacyComputeSortScoreSurface(string surface, string[] patterns, StepRunnerDefinition? row = null)
    {
        if (patterns.Length == 0)
        {
            return 0;
        }

        var score = 0;
        var keyLower = (row?.Key ?? string.Empty).ToLowerInvariant();
        var nameLower = (row?.Name ?? string.Empty).ToLowerInvariant();
        var surfaceLower = surface.ToLowerInvariant();
        foreach (var p in patterns)
        {
            if (row is not null)
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
            else if (surfaceLower.IndexOf(p, StringComparison.Ordinal) >= 0)
            {
                score += 4;
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

        return BranchMatchesSurface(GetMatchSurface(row), branchTokens);
    }

    private static bool BranchMatchesSurface(string surface, string[] branchTokens)
    {
        if (branchTokens.Length == 0)
        {
            return true;
        }

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
            if (surface.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            var normalizedToken = NormalizeMatchText(token);
            return normalizedToken.Length > 0
                && NormalizeMatchText(surface).IndexOf(normalizedToken, StringComparison.Ordinal) >= 0;
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
