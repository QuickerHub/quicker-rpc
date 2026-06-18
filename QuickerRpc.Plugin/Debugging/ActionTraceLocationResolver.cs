using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Debugging;

/// <summary>Maps trace events to data.json step paths (patch/diagnostics compatible).</summary>
public static class ActionTraceLocationResolver
{
    public sealed class ProgramStepEntry
    {
        public string NodePath { get; init; } = string.Empty;

        public string StepRunnerKey { get; init; } = string.Empty;

        public string? Note { get; init; }

        public string? StepId { get; init; }
    }

    public static IList<ProgramStepEntry> WalkProgramSteps(JArray steps) =>
        WalkProgramStepsCore(steps, string.Empty);

    public static Dictionary<string, string> BuildStepIdToPathMap(JArray steps)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in WalkProgramSteps(steps))
        {
            if (string.IsNullOrWhiteSpace(entry.StepId))
            {
                continue;
            }

            AddMapEntry(map, entry.StepId.Trim(), entry.NodePath);
            foreach (var candidate in NormalizeTraceStepIdCandidates(entry.StepId))
            {
                AddMapEntry(map, candidate, entry.NodePath);
            }
        }

        return map;
    }

    public static QuickerRpcActionTraceFailureLocation? ResolveFailureLocation(
        IReadOnlyList<QuickerRpcActionTraceEvent> events,
        JArray? programSteps,
        string? fallbackErrorMessage = null)
    {
        if (events.Count == 0)
        {
            return null;
        }

        var treeSteps = programSteps is null ? [] : WalkProgramSteps(programSteps);
        var stepIdToPath = programSteps is null
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : BuildStepIdToPathMap(programSteps);
        var sequenceMap = BuildTraceStepIdToPathMap(events, treeSteps, stepIdToPath);

        var errorIndex = -1;
        for (var i = events.Count - 1; i >= 0; i--)
        {
            if (string.Equals(events[i].Kind, "error", StringComparison.Ordinal))
            {
                errorIndex = i;
                break;
            }
        }

        string? errorMessage = null;
        QuickerRpcActionTraceEvent? errorEvent = null;
        if (errorIndex >= 0)
        {
            errorEvent = events[errorIndex];
            errorMessage = errorEvent.Message;
        }
        else if (!string.IsNullOrWhiteSpace(fallbackErrorMessage))
        {
            errorMessage = fallbackErrorMessage.Trim();
            errorIndex = events.Count - 1;
        }
        else
        {
            return null;
        }

        var stepBegin = FindLastStepBeginBefore(events, errorIndex);
        var stepId = FirstNonEmpty(stepBegin?.StepId, errorEvent?.StepId);
        var stepPath = FirstNonEmpty(errorEvent?.StepPath, stepBegin?.StepPath);
        var stepRunnerKey = FirstNonEmpty(
            stepBegin?.StepRunnerKey,
            errorEvent?.StepRunnerKey);
        var paramKey = FindNearestParamKey(events, errorIndex);

        if (string.IsNullOrWhiteSpace(stepPath) && !string.IsNullOrWhiteSpace(stepId))
        {
            if (stepIdToPath.TryGetValue(stepId, out var byId))
            {
                stepPath = byId;
            }
            else if (sequenceMap.TryGetValue(stepId, out var bySequence))
            {
                stepPath = bySequence;
            }
            else
            {
                foreach (var candidate in NormalizeTraceStepIdCandidates(stepId))
                {
                    if (stepIdToPath.TryGetValue(candidate, out byId)
                        || sequenceMap.TryGetValue(candidate, out byId))
                    {
                        stepPath = byId;
                        break;
                    }
                }
            }
        }

        if (string.IsNullOrWhiteSpace(stepPath))
        {
            stepPath = ResolveByRunnerKey(treeSteps, stepRunnerKey, stepBegin?.Note);
        }

        if (string.IsNullOrWhiteSpace(stepPath))
        {
            return new QuickerRpcActionTraceFailureLocation
            {
                Message = errorMessage,
                ParamKey = paramKey,
                StepId = stepId,
                StepRunnerKey = stepRunnerKey,
            };
        }

        var matchMethod = ResolveMatchMethod(stepId, stepPath, stepIdToPath, sequenceMap);
        return new QuickerRpcActionTraceFailureLocation
        {
            StepId = stepId,
            StepPath = stepPath,
            StepRunnerKey = stepRunnerKey,
            ParamKey = paramKey,
            DataJsonPointer = BuildDataJsonPointer(stepPath, paramKey),
            Message = errorMessage,
            MatchMethod = matchMethod,
        };
    }

    public static string BuildDataJsonPointer(string stepPath, string? paramKey)
    {
        if (!string.IsNullOrWhiteSpace(paramKey))
        {
            return $"steps[{stepPath}].inputParams.{paramKey.Trim()}";
        }

        return $"steps[{stepPath}]";
    }

    /// <summary>Populate <see cref="QuickerRpcActionTraceRunResult.FailureLocation"/> from trace events + program steps.</summary>
    public static QuickerRpcActionTraceRunResult AttachFailureLocation(
        QuickerRpcActionTraceRunResult result,
        JArray? programSteps)
    {
        result.FailureLocation = ResolveFailureLocation(
            result.Events,
            programSteps,
            result.Ok ? null : result.ErrorMessage ?? result.Message);
        return result;
    }

    private static IList<ProgramStepEntry> WalkProgramStepsCore(JArray steps, string pathPrefix)
    {
        var entries = new List<ProgramStepEntry>();
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var nodePath = string.IsNullOrEmpty(pathPrefix) ? i.ToString() : $"{pathPrefix}/{i}";
            entries.Add(new ProgramStepEntry
            {
                NodePath = nodePath,
                StepRunnerKey = (step.Value<string>("stepRunnerKey") ?? string.Empty).Trim(),
                Note = NullIfWhiteSpace(step.Value<string>("note")),
                StepId = NullIfWhiteSpace(step.Value<string>("stepId") ?? step.Value<string>("StepId")),
            });

            if (step["ifSteps"] is JArray ifSteps && ifSteps.Count > 0)
            {
                entries.AddRange(WalkProgramStepsCore(ifSteps, $"{nodePath}/if"));
            }

            if (step["elseSteps"] is JArray elseSteps && elseSteps.Count > 0)
            {
                entries.AddRange(WalkProgramStepsCore(elseSteps, $"{nodePath}/else"));
            }
        }

        return entries;
    }

    private static Dictionary<string, string> BuildTraceStepIdToPathMap(
        IReadOnlyList<QuickerRpcActionTraceEvent> events,
        IList<ProgramStepEntry> treeSteps,
        IReadOnlyDictionary<string, string> stepIdToPath)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var traceSteps = new List<(string StepId, string RunnerKey)>();

        foreach (var evt in events)
        {
            if (!string.Equals(evt.Kind, "step_begin", StringComparison.Ordinal))
            {
                continue;
            }

            var stepId = NullIfWhiteSpace(evt.StepId)
                ?? $"{evt.StepRunnerKey ?? "step"}#{traceSteps.Count}";
            if (!seen.Add(stepId))
            {
                continue;
            }

            traceSteps.Add((stepId, (evt.StepRunnerKey ?? string.Empty).Trim()));
            if (stepIdToPath.TryGetValue(stepId, out var path))
            {
                map[stepId] = path;
            }
        }

        var treeIndex = 0;
        foreach (var (stepId, runnerKey) in traceSteps)
        {
            if (map.ContainsKey(stepId))
            {
                continue;
            }

            while (treeIndex < treeSteps.Count
                && !string.Equals(treeSteps[treeIndex].StepRunnerKey, runnerKey, StringComparison.Ordinal))
            {
                treeIndex++;
            }

            if (treeIndex >= treeSteps.Count)
            {
                break;
            }

            map[stepId] = treeSteps[treeIndex].NodePath;
            treeIndex++;
        }

        return map;
    }

    private static QuickerRpcActionTraceEvent? FindLastStepBeginBefore(
        IReadOnlyList<QuickerRpcActionTraceEvent> events,
        int endIndex)
    {
        for (var i = endIndex; i >= 0; i--)
        {
            if (string.Equals(events[i].Kind, "step_begin", StringComparison.Ordinal))
            {
                return events[i];
            }
        }

        return null;
    }

    private static string? FindNearestParamKey(
        IReadOnlyList<QuickerRpcActionTraceEvent> events,
        int endIndex)
    {
        for (var i = endIndex; i >= 0; i--)
        {
            var kind = events[i].Kind ?? string.Empty;
            if (kind is "step_begin" or "step_end")
            {
                break;
            }

            var paramKey = NullIfWhiteSpace(events[i].ParamKey);
            if (paramKey is not null)
            {
                return paramKey;
            }
        }

        return null;
    }

    private static string? ResolveByRunnerKey(
        IList<ProgramStepEntry> treeSteps,
        string? runnerKey,
        string? note)
    {
        if (string.IsNullOrWhiteSpace(runnerKey))
        {
            return null;
        }

        var matches = treeSteps
            .Where(step => string.Equals(step.StepRunnerKey, runnerKey.Trim(), StringComparison.Ordinal))
            .ToList();
        if (matches.Count == 1)
        {
            return matches[0].NodePath;
        }

        if (matches.Count > 1 && !string.IsNullOrWhiteSpace(note))
        {
            var noted = matches.FirstOrDefault(step => step.Note == note);
            if (noted is not null)
            {
                return noted.NodePath;
            }
        }

        return null;
    }

    private static string ResolveMatchMethod(
        string? stepId,
        string stepPath,
        IReadOnlyDictionary<string, string> stepIdToPath,
        IReadOnlyDictionary<string, string> sequenceMap)
    {
        if (!string.IsNullOrWhiteSpace(stepId) && stepIdToPath.TryGetValue(stepId, out var byId) && byId == stepPath)
        {
            return "stepId";
        }

        if (!string.IsNullOrWhiteSpace(stepId) && sequenceMap.TryGetValue(stepId, out var bySequence) && bySequence == stepPath)
        {
            return "stepRunnerSequence";
        }

        return "stepRunnerKey";
    }

    private static IEnumerable<string> NormalizeTraceStepIdCandidates(string stepId)
    {
        var trimmed = stepId.Trim();
        yield return trimmed;

        var parts = trimmed.Split('-');
        while (parts.Length > 1 && int.TryParse(parts[^1], out _))
        {
            Array.Resize(ref parts, parts.Length - 1);
            yield return string.Join("-", parts);
        }
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            var trimmed = NullIfWhiteSpace(value);
            if (trimmed is not null)
            {
                return trimmed;
            }
        }

        return null;
    }

    private static void AddMapEntry(Dictionary<string, string> map, string key, string value)
    {
        if (!map.ContainsKey(key))
        {
            map[key] = value;
        }
    }

    private static string? NullIfWhiteSpace(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
