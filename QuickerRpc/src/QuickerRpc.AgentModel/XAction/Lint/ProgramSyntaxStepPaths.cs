using System;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Walks <c>data.json</c> step trees with patch-style paths (e.g. <c>2</c>, <c>1/if/0</c>).</summary>
public static class ProgramSyntaxStepPaths
{
    public delegate void StepVisit(
        JObject step,
        string stepPath,
        string stepId,
        string stepRunnerKey);

    public static void Walk(JArray steps, StepVisit visit) =>
        Walk(steps, string.Empty, visit);

    private static void Walk(JArray steps, string pathPrefix, StepVisit visit)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var stepPath = string.IsNullOrEmpty(pathPrefix)
                ? i.ToString()
                : $"{pathPrefix}/{i}";
            var stepId = ReadStepId(step);
            var runnerKey = (step.Value<string>("stepRunnerKey") ?? string.Empty).Trim();
            visit(step, stepPath, stepId, runnerKey);

            if (step["ifSteps"] is JArray ifSteps)
            {
                WalkBranch(ifSteps, $"{stepPath}/if", visit);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                WalkBranch(elseSteps, $"{stepPath}/else", visit);
            }
        }
    }

    private static void WalkBranch(JArray branch, string branchPrefix, StepVisit visit)
    {
        for (var i = 0; i < branch.Count; i++)
        {
            if (branch[i] is not JObject step)
            {
                continue;
            }

            var stepPath = $"{branchPrefix}/{i}";
            var stepId = ReadStepId(step);
            var runnerKey = (step.Value<string>("stepRunnerKey") ?? string.Empty).Trim();
            visit(step, stepPath, stepId, runnerKey);

            if (step["ifSteps"] is JArray ifSteps)
            {
                WalkBranch(ifSteps, $"{stepPath}/if", visit);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                WalkBranch(elseSteps, $"{stepPath}/else", visit);
            }
        }
    }

    internal static string ReadStepId(JObject step)
    {
        var stepId = step.Value<string>("stepId")?.Trim();
        if (!string.IsNullOrEmpty(stepId))
        {
            return stepId;
        }

        var runner = step.Value<string>("stepRunnerKey")?.Trim();
        return string.IsNullOrEmpty(runner) ? "step" : $"step ({runner})";
    }
}
