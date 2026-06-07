using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Structural checks on data.json (no RPC / compile).</summary>
public static class ProgramStructureLint
{
    private static readonly Regex BraceToken = new(
        @"\{([a-zA-Z_][a-zA-Z0-9_]*)\}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly HashSet<string> KnownExpressionNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "clipText",
        "clipImage",
        "clipHtml",
        "clipFiles",
        "context",
        "env",
        "null",
        "true",
        "false",
    };

    public static IList<ProgramSyntaxIssue> Analyze(JObject data)
    {
        var issues = new List<ProgramSyntaxIssue>();
        var definedKeys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        AnalyzeSteps(data["steps"] as JArray, definedKeys, issues);
        AnalyzeVariables(data["variables"] as JArray, issues);
        return issues;
    }

    private static void AnalyzeSteps(
        JArray? steps,
        IReadOnlyCollection<string> definedKeys,
        IList<ProgramSyntaxIssue> issues)
    {
        if (steps is null)
        {
            return;
        }

        var seenIds = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        ProgramSyntaxStepPaths.Walk(
            steps,
            (step, stepPath, stepId, runnerKey) =>
            {
                if (string.IsNullOrWhiteSpace(runnerKey))
                {
                    issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                        ProgramSyntaxIssueSeverity.Warning,
                        "MISSING_STEP_RUNNER",
                        "Step has no stepRunnerKey; assign a step module before patch/push.",
                        stepPath,
                        stepId,
                        runnerKey,
                        paramName: null,
                        variableKey: null));
                }

                var rawId = step.Value<string>("stepId")?.Trim();
                if (string.IsNullOrEmpty(rawId))
                {
                    return;
                }

                if (seenIds.TryGetValue(rawId, out var firstPath))
                {
                    issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                        ProgramSyntaxIssueSeverity.Error,
                        "DUPLICATE_STEP_ID",
                        $"Duplicate stepId \"{rawId}\" (also at steps[{firstPath}]).",
                        stepPath,
                        stepId,
                        runnerKey,
                        paramName: null,
                        variableKey: null));
                }
                else
                {
                    seenIds[rawId] = stepPath;
                }

                AnalyzeStepParams(step, stepPath, stepId, runnerKey, definedKeys, issues);
            });
    }

    private static void AnalyzeStepParams(
        JObject step,
        string stepPath,
        string stepId,
        string runnerKey,
        IReadOnlyCollection<string> definedKeys,
        IList<ProgramSyntaxIssue> issues)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        foreach (var prop in inputParams.Properties())
        {
            if (!TryReadInlineText(prop.Value, out var text) || text.Length == 0)
            {
                continue;
            }

            AnalyzeExpressionVariableRefs(
                text,
                definedKeys,
                issues,
                stepPath,
                stepId,
                runnerKey,
                prop.Name,
                variableKey: null);
        }
    }

    private static void AnalyzeVariables(JArray? variables, IList<ProgramSyntaxIssue> issues)
    {
        if (variables is null)
        {
            return;
        }

        var seenKeys = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var definedKeys = InterpolationPrefixLint.CollectVariableKeys(variables);

        for (var i = 0; i < variables.Count; i++)
        {
            if (variables[i] is not JObject varObj)
            {
                continue;
            }

            var key = (varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? string.Empty).Trim();
            if (key.Length == 0)
            {
                issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                    ProgramSyntaxIssueSeverity.Warning,
                    "MISSING_VARIABLE_KEY",
                    $"variables[{i}] has no key.",
                    stepPath: null,
                    stepId: null,
                    stepRunnerKey: null,
                    paramName: null,
                    variableKey: null));
                continue;
            }

            if (seenKeys.TryGetValue(key, out var firstIndex))
            {
                issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                    ProgramSyntaxIssueSeverity.Error,
                    "DUPLICATE_VARIABLE_KEY",
                    $"Duplicate variable key \"{key}\" (also at variables[{firstIndex}]).",
                    stepPath: null,
                    stepId: null,
                    stepRunnerKey: null,
                    paramName: null,
                    variableKey: key));
            }
            else
            {
                seenKeys[key] = i;
            }

            if (VariableDefaultValueRef.HasFileRef(varObj))
            {
                continue;
            }

            if (!VariableDefaultValueRef.TryGetInlineString(varObj, out var defaultText)
                || string.IsNullOrWhiteSpace(defaultText))
            {
                continue;
            }

            AnalyzeExpressionVariableRefs(
                defaultText,
                definedKeys,
                issues,
                stepPath: null,
                stepId: null,
                stepRunnerKey: null,
                paramName: "defaultValue",
                variableKey: key);
        }
    }

    private static void AnalyzeExpressionVariableRefs(
        string text,
        IReadOnlyCollection<string> definedKeys,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey,
        string? paramName,
        string? variableKey)
    {
        var trimmed = text.TrimStart();
        if (!trimmed.StartsWith("$=", StringComparison.Ordinal))
        {
            return;
        }

        if (definedKeys.Count == 0)
        {
            return;
        }

        var keys = definedKeys as HashSet<string>
                   ?? new HashSet<string>(definedKeys, StringComparer.OrdinalIgnoreCase);

        foreach (Match match in BraceToken.Matches(text))
        {
            var name = match.Groups[1].Value;
            if (KnownExpressionNames.Contains(name) || keys.Contains(name))
            {
                continue;
            }

            issues.Add(ProgramSyntaxIssueFactory.CreateStructureIssue(
                ProgramSyntaxIssueSeverity.Warning,
                "UNDEFINED_VARIABLE_IN_EXPRESSION",
                $"Expression references \"{{{name}}}\" but no variable key \"{name}\" is defined.",
                stepPath,
                stepId,
                stepRunnerKey,
                paramName,
                variableKey));
        }
    }

    private static bool TryReadInlineText(JToken? paramToken, out string text)
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
}
