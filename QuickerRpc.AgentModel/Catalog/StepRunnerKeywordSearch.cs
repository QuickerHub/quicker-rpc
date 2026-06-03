using System;
using System.Collections.Generic;
using System.Linq;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Agent-oriented keyword scoring for step-runner search: module body + every control-field selection.
/// </summary>
public static class StepRunnerKeywordSearch
{
    public static int ComputeSortScore(StepRunnerDefinition row, StepRunnerSearchQuery query) =>
        ComputeRank(row, query).TotalScore;

    public static StepRunnerSearchRankResult ComputeRank(
        StepRunnerDefinition row,
        StepRunnerSearchQuery query)
    {
        if (query.IsEmpty)
        {
            return new StepRunnerSearchRankResult();
        }

        var moduleDoc = StepRunnerRetrievalBuilder.BuildModuleOnly(row);
        var moduleScore = ComputeModuleScore(moduleDoc, row, query);
        var (controlScore, control) = ComputeBestControlFieldScore(row, moduleDoc, query);
        var controlRankBias = ResolveControlRankBias(moduleDoc, control?.Value);
        var moduleRankBias = moduleDoc.RankBias;
        var matchScore = moduleScore + controlScore;
        var total = matchScore + moduleRankBias + controlRankBias;

        return new StepRunnerSearchRankResult
        {
            ModuleScore = moduleScore,
            ControlScore = controlScore,
            ModuleRankBias = moduleRankBias,
            ControlRankBias = controlRankBias,
            TotalScore = total,
            Control = control,
        };
    }

    private static int ResolveControlRankBias(StepRunnerRetrievalDocument moduleDoc, string? controlValue)
    {
        var value = (controlValue ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return 0;
        }

        return moduleDoc.ControlRankBias.TryGetValue(value, out var bias) ? bias : 0;
    }

    private static int ComputeModuleScore(
        StepRunnerRetrievalDocument doc,
        StepRunnerDefinition row,
        StepRunnerSearchQuery query)
    {
        if (query.IsAdvanced)
        {
            if (query.Branches.Length == 0)
            {
                return 0;
            }

            var best = int.MinValue;
            foreach (var branch in query.Branches)
            {
                if (!BranchMatchesDocument(doc, row, branch, moduleOnlySurface: true))
                {
                    continue;
                }

                var score = ScoreBranch(doc, branch);
                if (score > best)
                {
                    best = score;
                }
            }

            return best == int.MinValue ? 0 : best;
        }

        return LegacyRowMatchesDocument(doc, row, query.LegacyPatterns, moduleOnlySurface: true)
            ? ScoreBranch(doc, query.LegacyPatterns)
            : 0;
    }

    private static (int Score, StepRunnerControlFieldMatch? Match) ComputeBestControlFieldScore(
        StepRunnerDefinition row,
        StepRunnerRetrievalDocument moduleDoc,
        StepRunnerSearchQuery query)
    {
        var control = StepRunnerInputParamVisibility.TryFindControlField(row.InputParamDefs);
        if (control is null || control.SelectionItems.Count == 0)
        {
            return (0, null);
        }

        var controlKey = control.Key ?? string.Empty;
        var bestMatchScore = 0;
        var bestEffective = int.MinValue;
        StepRunnerControlFieldMatch? bestMatch = null;

        foreach (var si in control.SelectionItems)
        {
            var value = (si.Value ?? string.Empty).Trim();
            var name = (si.Name ?? string.Empty).Trim();
            if (value.Length == 0 && name.Length == 0)
            {
                continue;
            }

            var matchScore = ScoreControlSelection(control, si, moduleDoc, query);
            var effective = matchScore + ResolveControlRankBias(moduleDoc, value);
            if (effective <= bestEffective)
            {
                continue;
            }

            bestEffective = effective;
            bestMatchScore = matchScore;
            bestMatch = new StepRunnerControlFieldMatch
            {
                Key = controlKey,
                Value = value,
                Name = name,
            };
        }

        return bestMatch is not null ? (bestMatchScore, bestMatch) : (0, null);
    }

    private static int ScoreControlSelection(
        StepRunnerInputParamDef control,
        StepRunnerParamSelectionItem selection,
        StepRunnerRetrievalDocument moduleDoc,
        StepRunnerSearchQuery query)
    {
        var surface = BuildControlSelectionSurface(control, selection);
        if (surface.Length == 0)
        {
            return 0;
        }

        if (query.IsAdvanced)
        {
            if (query.Branches.Length == 0)
            {
                return 0;
            }

            var best = int.MinValue;
            foreach (var branch in query.Branches)
            {
                if (!StepRunnerSearchQuery.BranchMatchesSurface(surface, branch))
                {
                    continue;
                }

                var score = ScoreControlBranch(surface, branch, moduleDoc);
                if (score > best)
                {
                    best = score;
                }
            }

            return best == int.MinValue ? 0 : best;
        }

        // Legacy: score every selection when the row already matched; pick strongest option.
        return ScoreControlBranch(surface, query.LegacyPatterns, moduleDoc);
    }

    private static string BuildControlSelectionSurface(
        StepRunnerInputParamDef control,
        StepRunnerParamSelectionItem selection) =>
        string.Join(
            "\n",
            control.Name ?? string.Empty,
            control.Description ?? string.Empty,
            selection.Name ?? string.Empty,
            selection.Value ?? string.Empty,
            selection.Description ?? string.Empty);

    private static int ScoreControlBranch(
        string surface,
        string[] tokens,
        StepRunnerRetrievalDocument moduleDoc)
    {
        var normalized = NormalizeTokens(tokens);
        if (normalized.Length == 0)
        {
            return 0;
        }

        var parts = surface.Split('\n');
        var controlTitle = parts.Length > 0 ? parts[0] : string.Empty;
        var controlDesc = parts.Length > 1 ? parts[1] : string.Empty;
        var selectionName = parts.Length > 2 ? parts[2] : string.Empty;
        var selectionValue = parts.Length > 3 ? parts[3] : string.Empty;
        var selectionDesc = parts.Length > 4 ? parts[4] : string.Empty;

        var score = 0;
        foreach (var token in normalized)
        {
            score += ScoreControlFieldToken(
                selectionName,
                selectionValue,
                selectionDesc,
                controlTitle,
                token);
            score += ScoreControlFieldToken(
                selectionName,
                selectionValue,
                selectionDesc,
                controlDesc,
                token);
            score += ApplyModuleNotForPenalty(moduleDoc, token);
        }

        // Phrase-level match (e.g. 移动窗口增强 on 移动窗口(增强)).
        var phrase = string.Join(" ", normalized);
        score += ScorePhraseOnText(selectionName, phrase, exact: 42, normalized: 28);
        score += ScorePhraseOnText(selectionDesc, phrase, exact: 12, normalized: 8);

        return score;
    }

    private static int ScorePhraseOnText(string text, string phrase, int exact, int normalized)
    {
        if (string.IsNullOrWhiteSpace(text) || phrase.Length == 0)
        {
            return 0;
        }

        var lower = text.Trim().ToLowerInvariant();
        if (string.Equals(lower, phrase, StringComparison.Ordinal))
        {
            return exact;
        }

        var normText = StepRunnerSearchQuery.NormalizeMatchText(lower);
        var normPhrase = StepRunnerSearchQuery.NormalizeMatchText(phrase);
        if (normText.Length > 0
            && normPhrase.Length > 0
            && normText.IndexOf(normPhrase, StringComparison.Ordinal) >= 0)
        {
            return normalized;
        }

        return 0;
    }

    private static int ScoreControlFieldToken(
        string selectionName,
        string selectionValue,
        string selectionDescription,
        string controlTitle,
        string token)
    {
        var score = 0;
        var normToken = StepRunnerSearchQuery.NormalizeMatchText(token);
        if (normToken.Length == 0)
        {
            return 0;
        }

        score += ScoreFieldText(selectionName, token, normToken, exact: 38, contains: 24, normalized: 20);
        score += ScoreFieldText(selectionValue, token, normToken, exact: 32, contains: 18, normalized: 16);
        score += ScoreFieldText(selectionDescription, token, normToken, exact: 14, contains: 8, normalized: 6);
        score += ScoreFieldText(controlTitle, token, normToken, exact: 10, contains: 6, normalized: 5);

        return score;
    }

    private static int ScoreFieldText(
        string text,
        string token,
        string normToken,
        int exact,
        int contains,
        int normalized)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return 0;
        }

        var lower = text.Trim().ToLowerInvariant();
        if (string.Equals(lower, token, StringComparison.Ordinal))
        {
            return exact;
        }

        if (lower.IndexOf(token, StringComparison.Ordinal) >= 0)
        {
            return contains;
        }

        var normText = StepRunnerSearchQuery.NormalizeMatchText(lower);
        if (normText.Length > 0 && normText.IndexOf(normToken, StringComparison.Ordinal) >= 0)
        {
            return normalized;
        }

        return 0;
    }

    private static bool BranchMatchesDocument(
        StepRunnerRetrievalDocument doc,
        StepRunnerDefinition row,
        string[] branchTokens,
        bool moduleOnlySurface)
    {
        if (branchTokens.Length == 0)
        {
            return true;
        }

        var surface = moduleOnlySurface
            ? BuildModuleMatchSurface(row)
            : StepRunnerSearchQuery.GetMatchSurface(row);
        return branchTokens.All(t => StepRunnerSearchQuery.TokenMatches(surface, t));
    }

    private static bool LegacyRowMatchesDocument(
        StepRunnerRetrievalDocument doc,
        StepRunnerDefinition row,
        string[] patterns,
        bool moduleOnlySurface)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        var surface = moduleOnlySurface
            ? BuildModuleMatchSurface(row)
            : StepRunnerSearchQuery.GetMatchSurface(row);
        return StepRunnerSearchQuery.LegacyRowMatchesSurface(surface, patterns);
    }

    private static string BuildModuleMatchSurface(StepRunnerDefinition row)
    {
        var doc = StepRunnerRetrievalBuilder.BuildModuleOnly(row);
        return string.Join(
            "\n",
            doc.Key,
            doc.Name,
            doc.Description,
            doc.Category,
            string.Join("\n", doc.AgentKeywords),
            StepRunnerRetrievalBuilder.GetKeywordExtensions(row));
    }

    private static int ScoreBranch(StepRunnerRetrievalDocument doc, string[] tokens)
    {
        var normalized = NormalizeTokens(tokens);
        if (normalized.Length == 0)
        {
            return 0;
        }

        var score = 0;
        foreach (var token in normalized)
        {
            score += ScoreModuleToken(doc, token);
        }

        return score;
    }

    private static int ScoreModuleToken(StepRunnerRetrievalDocument doc, string token)
    {
        var score = 0;
        var keyLower = doc.Key.ToLowerInvariant();
        var normToken = StepRunnerSearchQuery.NormalizeMatchText(token);
        var searchable = doc.SearchableText;
        var normSearchable = StepRunnerSearchQuery.NormalizeMatchText(searchable);

        if (string.Equals(keyLower, token, StringComparison.Ordinal))
        {
            score += 60;
        }
        else if (keyLower.IndexOf(token, StringComparison.Ordinal) >= 0
            || (!string.IsNullOrEmpty(normToken)
                && StepRunnerSearchQuery.NormalizeMatchText(keyLower).IndexOf(normToken, StringComparison.Ordinal) >= 0))
        {
            score += 45;
        }

        foreach (var kw in doc.AgentKeywords)
        {
            var kwLower = (kw ?? string.Empty).Trim().ToLowerInvariant();
            if (kwLower.Length == 0)
            {
                continue;
            }

            if (string.Equals(kwLower, token, StringComparison.Ordinal)
                || string.Equals(StepRunnerSearchQuery.NormalizeMatchText(kwLower), normToken, StringComparison.Ordinal))
            {
                score += 40;
            }
            else if (kwLower.IndexOf(token, StringComparison.Ordinal) >= 0
                || token.IndexOf(kwLower, StringComparison.Ordinal) >= 0)
            {
                score += 28;
            }
            else if (!string.IsNullOrEmpty(normToken)
                && StepRunnerSearchQuery.NormalizeMatchText(kwLower).IndexOf(normToken, StringComparison.Ordinal) >= 0)
            {
                score += 22;
            }
        }

        var nameLower = doc.Name.ToLowerInvariant();
        if (nameLower.IndexOf(token, StringComparison.Ordinal) >= 0
            || (!string.IsNullOrEmpty(normToken)
                && StepRunnerSearchQuery.NormalizeMatchText(nameLower).IndexOf(normToken, StringComparison.Ordinal) >= 0))
        {
            score += 14;
        }

        if ((doc.Description ?? string.Empty).IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            score += 6;
        }

        if (searchable.IndexOf(token, StringComparison.Ordinal) >= 0
            || (!string.IsNullOrEmpty(normToken)
                && normSearchable.IndexOf(normToken, StringComparison.Ordinal) >= 0))
        {
            score += 4;
        }

        score += ApplyModuleNotForPenalty(doc, token);
        return score;
    }

    private static int ApplyModuleNotForPenalty(StepRunnerRetrievalDocument doc, string token)
    {
        var penalty = 0;
        foreach (var nf in doc.NotFor)
        {
            var nfLower = (nf ?? string.Empty).Trim().ToLowerInvariant();
            if (nfLower.Length == 0)
            {
                continue;
            }

            if (string.Equals(nfLower, token, StringComparison.Ordinal)
                || nfLower.IndexOf(token, StringComparison.Ordinal) >= 0
                || token.IndexOf(nfLower, StringComparison.Ordinal) >= 0)
            {
                penalty -= 18;
            }
        }

        return penalty;
    }

    private static string[] NormalizeTokens(string[] tokens) =>
        tokens
            .Select(t => (t ?? string.Empty).Trim().ToLowerInvariant())
            .Where(t => t.Length > 0)
            .ToArray();
}
