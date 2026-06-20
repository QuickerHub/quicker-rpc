using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Parsed step-runner search: whitespace-AND for legacy queries; when AND returns no hits,
/// <see cref="StepRunnerCatalogMapper"/> retries tokens as OR. Explicit <c>|</c> (OR branches)
/// and <c>*</c> wildcards use advanced syntax.
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

    /// <summary>Lone <c>*</c> (no other characters) is browse, not match-all wildcard search.</summary>
    public static bool IsBareWildcardQuery(string? keyword)
    {
        var raw = (keyword ?? string.Empty).Trim();
        return raw.Length > 0 && raw.All(static c => c == '*');
    }

    /// <summary>Whitespace-separated tokens from a keyword (lowercased).</summary>
    public static string[] GetWhitespaceTokens(string? keyword) => SplitLegacyPatterns(keyword ?? string.Empty);

    public static bool CanTryOrTokenFallback(string? keyword, StepRunnerSearchQuery query)
    {
        if (query.IsAdvanced || query.IsEmpty || query.LegacyPatterns.Length < 2)
        {
            return false;
        }

        var raw = (keyword ?? string.Empty).Trim();
        return raw.Length > 0 && raw.IndexOf('|') < 0 && raw.IndexOf('*') < 0;
    }

    public static string ToOrTokenFallbackKeyword(string? keyword)
    {
        var tokens = SplitLegacyPatterns(keyword ?? string.Empty);
        return tokens.Length == 0 ? string.Empty : string.Join("|", tokens);
    }

    public static StepRunnerSearchQuery Parse(string? keyword)
    {
        var raw = (keyword ?? string.Empty).Trim();
        if (raw.Length == 0 || IsBareWildcardQuery(raw))
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
        if (query.IsEmpty)
        {
            return true;
        }

        if (query.IsAdvanced)
        {
            if (query.Branches.Length == 0)
            {
                return true;
            }

            return query.Branches.Any(branch =>
                BranchMatches(row, branch) && !BranchTokensHitNotFor(row, branch));
        }

        return !LegacyPatternsHitNotFor(row, query.LegacyPatterns)
            && LegacyRowMatches(row, query.LegacyPatterns);
    }

    /// <summary>
    /// When any query token matches a curated <c>notFor</c> label, hide the module from agent search
    /// (legacy steps like compute/formatString; prefer sys:evalexpression).
    /// </summary>
    private static bool LegacyPatternsHitNotFor(StepRunnerDefinition row, string[] patterns) =>
        TryGetNotForLabels(row, out var notFor) && AnyQueryTokenHitsNotFor(notFor, patterns);

    private static bool BranchTokensHitNotFor(StepRunnerDefinition row, string[] branchTokens) =>
        TryGetNotForLabels(row, out var notFor) && AnyQueryTokenHitsNotFor(notFor, branchTokens);

    private static bool TryGetNotForLabels(
        StepRunnerDefinition row,
        out IReadOnlyList<string> notFor)
    {
        notFor = Array.Empty<string>();
        var key = (row.Key ?? string.Empty).Trim();
        if (key.Length == 0
            || !StepRunnerAgentKeywordCatalog.TryGet(key, out var entry)
            || entry.NotFor.Count == 0)
        {
            return false;
        }

        notFor = entry.NotFor;
        return true;
    }

    private static bool AnyQueryTokenHitsNotFor(IReadOnlyList<string> notFor, string[] queryTokens)
    {
        foreach (var token in queryTokens)
        {
            var q = (token ?? string.Empty).Trim().ToLowerInvariant();
            if (q.Length == 0)
            {
                continue;
            }

            foreach (var nf in notFor)
            {
                var label = (nf ?? string.Empty).Trim().ToLowerInvariant();
                if (label.Length == 0)
                {
                    continue;
                }

                if (string.Equals(label, q, StringComparison.Ordinal)
                    || LegacyPatternMatchesSurface(label, q)
                    || LegacyPatternMatchesSurface(q, label))
                {
                    return true;
                }
            }
        }

        return false;
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

    public static string GetMatchSurface(StepRunnerDefinition row)
    {
        var parts = new List<string>
        {
            row.Key ?? string.Empty,
            row.Name ?? string.Empty,
            row.Description ?? string.Empty,
            row.Category ?? string.Empty
        };

        var keywordExtra = StepRunnerRetrievalBuilder.GetKeywordExtensions(row);
        if (keywordExtra.Length > 0)
        {
            parts.Add(keywordExtra);
        }

        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        var moduleKey = row.Key ?? string.Empty;
        if (control is not null)
        {
            foreach (var si in control.SelectionItems)
            {
                var value = (si.Value ?? string.Empty).Trim();
                if (value.Length > 0
                    && StepRunnerAgentSearchFilter.IsControlValueExcludedFromSearch(moduleKey, value))
                {
                    continue;
                }

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

        if (LegacyRowMatchesSurface(GetMatchSurface(row), patterns))
        {
            return true;
        }

        return LegacyRowMatchesAnyControlKeywords(row, patterns);
    }

    private static bool LegacyRowMatchesAnyControlKeywords(StepRunnerDefinition row, string[] patterns)
    {
        var key = row.Key ?? string.Empty;
        if (key.Length == 0
            || !StepRunnerAgentKeywordCatalog.TryGet(key, out var meta)
            || meta.ControlKeywords.Count == 0)
        {
            return false;
        }

        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        if (control is null)
        {
            return false;
        }

        foreach (var si in control.SelectionItems)
        {
            var value = (si.Value ?? string.Empty).Trim();
            if (value.Length == 0
                || StepRunnerAgentSearchFilter.IsControlValueExcludedFromSearch(key, value)
                || !meta.ControlKeywords.TryGetValue(value, out var keywords)
                || keywords is null
                || keywords.Count == 0)
            {
                continue;
            }

            var surface = string.Join(
                "\n",
                si.Name ?? string.Empty,
                si.Value ?? string.Empty,
                si.Description ?? string.Empty,
                string.Join("\n", keywords));

            if (LegacyRowMatchesSurface(surface, patterns))
            {
                return true;
            }
        }

        return false;
    }

    public static string NormalizeMatchText(string? text)
    {
        var raw = (text ?? string.Empty).Trim().ToLowerInvariant();
        return raw.Length == 0 ? string.Empty : MatchNormalization.Replace(raw, string.Empty);
    }

    public static bool LegacyRowMatchesSurface(string surface, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        return patterns.All(p => LegacyPatternMatchesSurface(surface, p));
    }

    /// <summary>
    /// Legacy token match: substring (incl. normalized), then CJK 2-char AND for compounds like 移动文件.
    /// </summary>
    public static bool LegacyPatternMatchesSurface(string surface, string pattern)
    {
        if (pattern.Length == 0)
        {
            return true;
        }

        if (LegacySubstringMatchesSurface(surface, pattern))
        {
            return true;
        }

        if (!IsCjkCompoundQuery(pattern))
        {
            return false;
        }

        var chunks = SplitCjkBigrams(pattern);
        return chunks.Length >= 2
            && chunks.All(chunk => LegacySubstringMatchesSurface(surface, chunk));
    }

    private static bool LegacySubstringMatchesSurface(string surface, string pattern)
    {
        var lower = surface.ToLowerInvariant();
        if (lower.IndexOf(pattern, StringComparison.Ordinal) >= 0)
        {
            return true;
        }

        var normalizedSurface = NormalizeMatchText(surface);
        var normalizedPattern = NormalizeMatchText(pattern);
        return normalizedPattern.Length > 0
            && normalizedSurface.Length > 0
            && normalizedSurface.IndexOf(normalizedPattern, StringComparison.Ordinal) >= 0;
    }

    private static bool IsCjkCompoundQuery(string pattern)
    {
        if (pattern.Length < 4)
        {
            return false;
        }

        var han = 0;
        foreach (var ch in pattern)
        {
            if (IsCjkUnified(ch))
            {
                han++;
            }
            else if (!char.IsWhiteSpace(ch))
            {
                return false;
            }
        }

        return han == pattern.Length;
    }

    private static bool IsCjkUnified(char ch) =>
        ch is >= '\u4e00' and <= '\u9fff'
        or >= '\u3400' and <= '\u4dbf';

    private static string[] SplitCjkBigrams(string text)
    {
        if (text.Length == 0)
        {
            return Array.Empty<string>();
        }

        var chunks = new List<string>();
        for (var i = 0; i < text.Length; i += 2)
        {
            chunks.Add(text.Length - i >= 2 ? text.Substring(i, 2) : text.Substring(i, 1));
        }

        return chunks.ToArray();
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

    public static bool BranchMatchesSurface(string surface, string[] branchTokens)
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

    public static bool TokenMatches(string surface, string token)
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
            if (normalizedToken.Length > 0
                && NormalizeMatchText(surface).IndexOf(normalizedToken, StringComparison.Ordinal) >= 0)
            {
                return true;
            }

            // Same CJK compound + legacy substring rules as whitespace-AND search.
            return LegacyPatternMatchesSurface(surface, token.ToLowerInvariant());
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
