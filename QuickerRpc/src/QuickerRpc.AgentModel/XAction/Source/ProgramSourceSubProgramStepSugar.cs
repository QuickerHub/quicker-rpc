// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Elevated subprogram sugar:
/// <c>subProgram: trimText</c> + <c>inputs</c>/<c>outputs</c>
/// ↔ <c>key: sys:subprogram</c> + step-level <c>subProgram</c>.
/// Module target lives on the step; <c>inputs.subProgram</c> is free for callee I/O.
/// </summary>
public static class ProgramSourceSubProgramStepSugar
{
    public const string TargetProperty = "subProgram";
    public const string TargetVarProperty = "subProgram.var";
    public const string RunnerKey = ProgramSourceSubProgramIoFold.SubProgramRunnerKey;

    public static void DesugarInPlace(JObject root)
    {
        DesugarSteps(root["steps"] as JArray);
        if (root["subPrograms"] as JArray is { } subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                DesugarInPlace(sp);
            }
        }
    }

    public static void ResugarInPlace(JObject root)
    {
        ResugarSteps(root["steps"] as JArray);
        if (root["subPrograms"] as JArray is { } subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                ResugarInPlace(sp);
            }
        }
    }

    /// <summary>
    /// Ensure module target is on the step (not in <c>inputs</c>). Safe when step-level
    /// target already exists — leftover <c>inputs.subProgram</c> is treated as callee I/O.
    /// </summary>
    public static void LiftModuleTargetToStepInPlace(JObject step)
    {
        if (!ProgramSourceSubProgramIoFold.IsSubProgramStep(step)
            && !HasElevatedTarget(step))
        {
            return;
        }

        if (HasElevatedTarget(step))
        {
            return;
        }

        var inputs = AgentStepWireAliases.ReadInputMap(step);
        if (inputs is null)
        {
            return;
        }

        if (inputs[TargetVarProperty] is not null)
        {
            step[TargetVarProperty] = inputs[TargetVarProperty]!.DeepClone();
            inputs.Remove(TargetVarProperty);
            return;
        }

        if (inputs[TargetProperty] is not null)
        {
            step[TargetProperty] = inputs[TargetProperty]!.DeepClone();
            inputs.Remove(TargetProperty);
        }
    }

    /// <summary>
    /// After bare→<c>var:</c> expand, copy step-level target into <c>inputParams.subProgram</c>
    /// for native ActionStep runners.
    /// </summary>
    public static void InjectModuleTargetIntoInputParams(JObject step)
    {
        if (!ProgramSourceSubProgramIoFold.IsSubProgramStep(step) && !HasElevatedTarget(step))
        {
            return;
        }

        var map = step["inputParams"] as JObject
            ?? step["InputParams"] as JObject
            ?? step["inputs"] as JObject
            ?? step["Inputs"] as JObject;
        if (map is null)
        {
            map = new JObject();
            if (step["inputParams"] is not null || step["InputParams"] is not null)
            {
                step["inputParams"] = map;
            }
            else
            {
                step["inputs"] = map;
            }
        }

        if (step[TargetVarProperty] is not null)
        {
            if (!map.ContainsKey(TargetVarProperty))
            {
                map[TargetVarProperty] = step[TargetVarProperty]!.DeepClone();
            }

            return;
        }

        if (step[TargetProperty] is not null && !map.ContainsKey(TargetProperty))
        {
            map[TargetProperty] = step[TargetProperty]!.DeepClone();
        }
    }

    public static bool HasElevatedTarget(JObject step) =>
        step[TargetProperty] is not null || step[TargetVarProperty] is not null;

    public static bool TryReadElevatedTarget(
        JObject step,
        out JToken? target,
        out bool isVarBind)
    {
        target = null;
        isVarBind = false;
        if (step[TargetVarProperty] is not null)
        {
            target = step[TargetVarProperty];
            isVarBind = true;
            return true;
        }

        if (step[TargetProperty] is null)
        {
            return false;
        }

        target = step[TargetProperty];
        if (target is JObject map
            && map["var"] is not null
            && map.Count == 1)
        {
            target = map["var"];
            isVarBind = true;
        }

        return true;
    }

    private static void DesugarSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            if (TryDesugarElevated(step, out var wire))
            {
                steps[i] = wire;
                step = wire;
            }

            DesugarSteps(step["ifSteps"] as JArray);
            DesugarSteps(step["elseSteps"] as JArray);
        }
    }

    private static void ResugarSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            ResugarSteps(step["ifSteps"] as JArray);
            ResugarSteps(step["elseSteps"] as JArray);

            if (TryResugarElevated(step, out var sugared))
            {
                steps[i] = sugared;
            }
        }
    }

    private static bool TryDesugarElevated(JObject step, out JObject wire)
    {
        wire = step;
        if (step["key"] is not null || step["if"] is not null)
        {
            return false;
        }

        // Old M3 uses lowercase short name "subprogram" as the sole property.
        if (!HasElevatedTarget(step))
        {
            return false;
        }

        wire = new JObject { ["key"] = RunnerKey };
        if (step[TargetVarProperty] is not null)
        {
            wire[TargetVarProperty] = step[TargetVarProperty]!.DeepClone();
        }
        else if (step[TargetProperty] is JObject valueForm
                 && valueForm["var"] is not null
                 && valueForm.Count == 1)
        {
            wire[TargetVarProperty] = valueForm["var"]!.DeepClone();
        }
        else if (step[TargetProperty] is not null)
        {
            wire[TargetProperty] = step[TargetProperty]!.DeepClone();
        }

        foreach (var prop in step.Properties())
        {
            if (prop.Name is TargetProperty or TargetVarProperty)
            {
                continue;
            }

            wire[prop.Name] = prop.Value.DeepClone();
        }

        return true;
    }

    private static bool TryResugarElevated(JObject step, out JObject sugared)
    {
        sugared = step;
        var runner = step.Value<string>("key");
        if (!string.Equals(runner, RunnerKey, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        foreach (var name in new[] { "note", "disabled", "collapsed", "delayMs", "stepId", "ifSteps", "elseSteps" })
        {
            if (step[name] is not null)
            {
                return false;
            }
        }

        foreach (var prop in step.Properties())
        {
            if (prop.Name is not "key"
                and not "inputs"
                and not "outputs"
                and not TargetProperty
                and not TargetVarProperty)
            {
                return false;
            }
        }

        if (!HasElevatedTarget(step))
        {
            return false;
        }

        sugared = new JObject();
        if (step[TargetVarProperty] is not null)
        {
            sugared[TargetProperty] = new JObject { ["var"] = step[TargetVarProperty]!.DeepClone() };
        }
        else
        {
            sugared[TargetProperty] = step[TargetProperty]!.DeepClone();
        }

        if (step["inputs"] is JObject inputs && inputs.Count > 0)
        {
            sugared["inputs"] = inputs.DeepClone();
        }

        if (step["outputs"] is JObject outputs && outputs.Count > 0)
        {
            sugared["outputs"] = outputs.DeepClone();
        }

        return true;
    }
}
