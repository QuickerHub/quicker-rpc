using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Debugging;

namespace QuickerRpc.Plugin.Test;

/// <summary>Builds logger-shaped trace events for offline pipeline tests (no Quicker runtime).</summary>
internal static class ActionTraceSyntheticEventFactory
{
    public static List<QuickerRpcActionTraceEvent> BuildLinearFailureTrace(
        JArray programSteps,
        string failingStepId,
        string errorMessage,
        string? paramKey = "expression")
    {
        var stepIdToPath = ActionTraceLocationResolver.BuildStepIdToPathMap(programSteps);
        var entries = ActionTraceLocationResolver.WalkProgramSteps(programSteps);
        var events = new List<QuickerRpcActionTraceEvent>();
        var sequence = 0;

        foreach (var entry in entries)
        {
            var stepId = !string.IsNullOrWhiteSpace(entry.StepId)
                ? entry.StepId!
                : $"runtime-{entry.NodePath}";
            var stepPath = ResolveStepPath(stepId, entry.NodePath, stepIdToPath);

            events.Add(new QuickerRpcActionTraceEvent
            {
                Sequence = ++sequence,
                Kind = "step_begin",
                StepId = stepId,
                StepRunnerKey = entry.StepRunnerKey,
                Note = entry.Note,
                StepPath = stepPath,
            });

            if (!string.Equals(stepId, failingStepId, System.StringComparison.Ordinal)
                && !string.Equals(entry.StepId, failingStepId, System.StringComparison.Ordinal))
            {
                events.Add(new QuickerRpcActionTraceEvent
                {
                    Sequence = ++sequence,
                    Kind = "step_end",
                    StepId = stepId,
                    StepPath = stepPath,
                });
                continue;
            }

            if (!string.IsNullOrWhiteSpace(paramKey))
            {
                events.Add(new QuickerRpcActionTraceEvent
                {
                    Sequence = ++sequence,
                    Kind = "input",
                    StepId = stepId,
                    StepRunnerKey = entry.StepRunnerKey,
                    StepPath = stepPath,
                    ParamKey = paramKey,
                });
            }

            events.Add(new QuickerRpcActionTraceEvent
            {
                Sequence = ++sequence,
                Kind = "error",
                StepId = stepId,
                StepRunnerKey = entry.StepRunnerKey,
                StepPath = stepPath,
                Message = errorMessage,
            });
            break;
        }

        return events;
    }

    private static string ResolveStepPath(
        string stepId,
        string nodePath,
        IReadOnlyDictionary<string, string> stepIdToPath)
    {
        if (stepIdToPath.TryGetValue(stepId, out var path))
        {
            return path;
        }

        var parts = stepId.Split('-');
        while (parts.Length > 1 && int.TryParse(parts[^1], out _))
        {
            System.Array.Resize(ref parts, parts.Length - 1);
            var candidate = string.Join("-", parts);
            if (stepIdToPath.TryGetValue(candidate, out path))
            {
                return path;
            }
        }

        return nodePath;
    }
}
