using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Structural checks on data.json (no RPC / compile).</summary>
public static class ProgramStructureLint
{
    public static IList<ProgramSyntaxIssue> Analyze(JObject data)
    {
        var issues = new List<ProgramSyntaxIssue>();
        AnalyzeSteps(data["steps"] as JArray, issues);
        AnalyzeVariables(data["variables"] as JArray, issues);
        return issues;
    }

    private static void AnalyzeSteps(
        JArray? steps,
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
            });
    }

    private static void AnalyzeVariables(JArray? variables, IList<ProgramSyntaxIssue> issues)
    {
        if (variables is null)
        {
            return;
        }

        var seenKeys = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

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
        }
    }
}
