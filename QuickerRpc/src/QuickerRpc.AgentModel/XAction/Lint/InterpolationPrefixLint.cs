using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>
/// Warn when a literal <c>inputParams.value</c> uses <c>{varKey}</c> without a leading <c>$$</c> prefix.
/// Only reports braces that match a defined action variable key.
/// </summary>
public static class InterpolationPrefixLint
{
    private static readonly Regex BraceToken = new(
        @"\{([a-zA-Z_][a-zA-Z0-9_]*)\}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly HashSet<string> SkipParamNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "expression",
        "script",
        "code",
    };

    public static IList<ProgramSyntaxIssue> Analyze(
        JObject data,
        IReadOnlyCollection<string> variableKeys,
        string? dataJsonText = null)
    {
        if (variableKeys.Count == 0)
        {
            return Array.Empty<ProgramSyntaxIssue>();
        }

        var keySet = new HashSet<string>(variableKeys, StringComparer.OrdinalIgnoreCase);
        var issues = new List<ProgramSyntaxIssue>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        if (data["steps"] is JArray steps)
        {
            ProgramSyntaxStepPaths.Walk(
                steps,
                (step, stepPath, stepId, runnerKey) =>
                    AnalyzeStepInputParams(
                        step,
                        stepPath,
                        stepId,
                        runnerKey,
                        keySet,
                        issues,
                        seen,
                        dataJsonText));
        }

        if (data["variables"] is JArray variables)
        {
            AnalyzeVariableDefaults(variables, keySet, issues, seen, dataJsonText);
        }

        return issues;
    }

    public static HashSet<string> CollectVariableKeys(JArray? variables)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (variables is null)
        {
            return keys;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = (varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? string.Empty).Trim();
            if (key.Length > 0)
            {
                keys.Add(key);
            }
        }

        return keys;
    }

    private static void AnalyzeStepInputParams(
        JObject step,
        string stepPath,
        string stepId,
        string runnerKey,
        IReadOnlyCollection<string> variableKeys,
        IList<ProgramSyntaxIssue> issues,
        ISet<string> seen,
        string? dataJsonText)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        foreach (var prop in inputParams.Properties())
        {
            if (SkipParamNames.Contains(prop.Name))
            {
                continue;
            }

            if (prop.Value is JObject paramObj && paramObj["varKey"] is not null)
            {
                continue;
            }

            if (!TryReadParamString(prop.Value, out var text))
            {
                continue;
            }

            AnalyzeLiteral(
                text,
                variableKeys,
                issues,
                seen,
                dataJsonText,
                stepPath,
                stepId,
                runnerKey,
                prop.Name,
                variableKey: null);
        }
    }

    private static void AnalyzeVariableDefaults(
        JArray variables,
        IReadOnlyCollection<string> variableKeys,
        IList<ProgramSyntaxIssue> issues,
        ISet<string> seen,
        string? dataJsonText)
    {
        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var varKey = (varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? string.Empty).Trim();
            if (varKey.Length == 0)
            {
                continue;
            }

            if (!TryReadVariableDefault(varObj, out var text))
            {
                continue;
            }

            AnalyzeLiteral(
                text,
                variableKeys,
                issues,
                seen,
                dataJsonText,
                stepPath: null,
                stepId: null,
                stepRunnerKey: null,
                paramName: "defaultValue",
                variableKey: varKey);
        }
    }

    internal static void AnalyzeLiteral(
        string text,
        IReadOnlyCollection<string> variableKeys,
        IList<ProgramSyntaxIssue> issues,
        ISet<string> seen,
        string? dataJsonText,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey,
        string? paramName,
        string? variableKey)
    {
        var trimmed = text.TrimStart();
        if (trimmed.StartsWith("$=", StringComparison.Ordinal)
            || trimmed.StartsWith("$$", StringComparison.Ordinal))
        {
            return;
        }

        var matchedVars = new List<string>();
        foreach (Match match in BraceToken.Matches(text))
        {
            var name = match.Groups[1].Value;
            if (variableKeys.Contains(name) && !matchedVars.Contains(name))
            {
                matchedVars.Add(name);
            }
        }

        if (matchedVars.Count == 0)
        {
            return;
        }

        var dedupeKey = $"{stepPath ?? "var"}|{paramName ?? "?"}|{variableKey ?? ""}|{text}";
        if (!seen.Add(dedupeKey))
        {
            return;
        }

        var sample = matchedVars[0];
        int? readStart = null;
        int? readEnd = null;
        if (!string.IsNullOrEmpty(dataJsonText))
        {
            var range = InterpolationPrefixLineLocator.LineRangeForValueLiteral(
                dataJsonText,
                paramName,
                text);
            if (range is not null)
            {
                readStart = range.Value.StartLine;
                readEnd = range.Value.EndLine;
            }
        }

        issues.Add(ProgramSyntaxIssueFactory.CreateInterpolationWarning(
            stepPath,
            stepId,
            stepRunnerKey,
            paramName,
            variableKey,
            "MISSING_INTERPOLATION_PREFIX",
            $"Possible missing $$/$= prefix for {{{sample}}} in a literal value "
            + "(warning only — literal braces may be intentional).",
            readStart,
            readEnd));
    }

    private static bool TryReadParamString(JToken? paramToken, out string text)
    {
        text = string.Empty;
        if (paramToken is null || paramToken.Type == JTokenType.Null)
        {
            return false;
        }

        if (paramToken.Type == JTokenType.String)
        {
            text = paramToken.Value<string>() ?? string.Empty;
            return text.Length > 0;
        }

        if (paramToken is not JObject paramObj)
        {
            return false;
        }

        if (paramObj["file"] is not null)
        {
            return false;
        }

        if (paramObj["value"] is JToken valueToken && valueToken.Type != JTokenType.Null)
        {
            text = valueToken.Type == JTokenType.String
                ? valueToken.Value<string>() ?? string.Empty
                : valueToken.ToString();
            return text.Length > 0;
        }

        return false;
    }

    private static bool TryReadVariableDefault(JObject varObj, out string text)
    {
        text = string.Empty;
        if (VariableDefaultValueRef.HasFileRef(varObj))
        {
            return false;
        }

        if (VariableDefaultValueRef.TryGetInlineString(varObj, out var inline))
        {
            text = inline ?? string.Empty;
            return text.Length > 0;
        }

        return false;
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
