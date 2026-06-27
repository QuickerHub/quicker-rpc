using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Omits empty <c>ifSteps</c>/<c>elseSteps</c> and strips branch arrays from non-branching steps on disk.
/// </summary>
internal static class StepBranchWireCoercer
{
    private static readonly HashSet<string> LoopKeyTails = new(StringComparer.OrdinalIgnoreCase)
    {
        "loop",
        "group",
        "each",
        "repeat",
        "foreach",
        "for",
        "while",
        "dowhile",
    };

    private static readonly HashSet<string> IfOnlyKeyTails = new(StringComparer.OrdinalIgnoreCase)
    {
        "simpleif",
        "if-only",
        "ifonly",
    };

    public static void CompactStepBranchesRecursive(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            CompactInputParamsOnStep(step);
            CompactStepBranchesRecursive(step["ifSteps"] as JArray);
            CompactStepBranchesRecursive(step["elseSteps"] as JArray);
            CompactStepBranches(step);
        }
    }

    private static void CompactInputParamsOnStep(JObject step)
    {
        InputParamWireCoercer.CompactInputParamsObject(step["inputParams"] as JObject);
    }

    private static void CompactStepBranches(JObject step)
    {
        var key = ReadStepRunnerKey(step);
        var (hasIfBranch, hasElseBranch) = InferBranches(key);

        if (!hasIfBranch || IsEmptyArray(step["ifSteps"]))
        {
            step.Remove("ifSteps");
            step.Remove("IfSteps");
        }

        if (!hasElseBranch || IsEmptyArray(step["elseSteps"]))
        {
            step.Remove("elseSteps");
            step.Remove("ElseSteps");
        }
    }

    public static (bool HasIfBranch, bool HasElseBranch) InferBranches(string stepRunnerKey)
    {
        var tail = NormalizeStepRunnerKeyTail(stepRunnerKey);
        if (LoopKeyTails.Contains(tail))
        {
            return (true, false);
        }

        if (string.Equals(tail, "if", StringComparison.OrdinalIgnoreCase))
        {
            return (true, true);
        }

        if (IfOnlyKeyTails.Contains(tail))
        {
            return (true, false);
        }

        return (false, false);
    }

    private static string ReadStepRunnerKey(JObject step) =>
        step["stepRunnerKey"]?.Value<string>()
        ?? step["StepRunnerKey"]?.Value<string>()
        ?? string.Empty;

    private static string NormalizeStepRunnerKeyTail(string stepRunnerKey)
    {
        var trimmed = (stepRunnerKey ?? string.Empty).Trim();
        if (trimmed.StartsWith("sys:", StringComparison.OrdinalIgnoreCase))
        {
            return trimmed.Substring(4);
        }

        return trimmed;
    }

    private static bool IsEmptyArray(JToken? token) =>
        token is JArray array && array.Count == 0;
}
