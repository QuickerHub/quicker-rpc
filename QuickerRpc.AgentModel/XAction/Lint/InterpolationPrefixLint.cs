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
        IReadOnlyCollection<string> variableKeys)
    {
        if (variableKeys.Count == 0)
        {
            return Array.Empty<ProgramSyntaxIssue>();
        }

        var keySet = new HashSet<string>(variableKeys, StringComparer.OrdinalIgnoreCase);
        var issues = new List<ProgramSyntaxIssue>();

        if (data["steps"] is JArray steps)
        {
            ProgramSyntaxStepPaths.Walk(
                steps,
                (step, stepPath, stepId, runnerKey) =>
                    AnalyzeStepInputParams(step, stepPath, stepId, runnerKey, keySet, issues));
        }

        if (data["variables"] is JArray variables)
        {
            AnalyzeVariableDefaults(variables, keySet, issues);
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
        IList<ProgramSyntaxIssue> issues)
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

            if (!TryReadParamString(prop.Value, out var text))
            {
                continue;
            }

            AnalyzeLiteral(
                text,
                variableKeys,
                issues,
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
        IList<ProgramSyntaxIssue> issues)
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

        foreach (Match match in BraceToken.Matches(text))
        {
            var name = match.Groups[1].Value;
            if (!variableKeys.Contains(name))
            {
                continue;
            }

            issues.Add(ProgramSyntaxIssueFactory.CreateInterpolationWarning(
                stepPath,
                stepId,
                stepRunnerKey,
                paramName,
                variableKey,
                "MISSING_INTERPOLATION_PREFIX",
                $"Use $$ prefix for string interpolation (e.g. $$…{{{name}}}…); "
                + $"bare {{{name}}} in a literal value will not expand."));
        }
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
