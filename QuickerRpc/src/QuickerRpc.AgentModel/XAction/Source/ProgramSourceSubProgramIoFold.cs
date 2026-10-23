// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Subprogram dynamic I/O: strip the legacy <c>var:</c> prefix so callee keys sit flat next to
/// module keys (<c>subProgram</c>, …). Dual-read flat <c>var:*</c>; optional legacy <c>in</c>/<c>out</c>
/// bags are flattened on migrate. Native ActionStep maps still use <c>var:*</c> after expand.
/// </summary>
public static class ProgramSourceSubProgramIoFold
{
    public const string VarKeyPrefix = "var:";
    public const string SubProgramRunnerKey = "sys:subprogram";

    /// <summary>Module fixed input keys that must not receive a <c>var:</c> prefix on expand.
    /// <c>subProgram</c> is NOT listed — module target lives on the step; <c>inputs.subProgram</c> is callee I/O.</summary>
    private static readonly HashSet<string> FixedInputBases = new(StringComparer.Ordinal)
    {
        "summary",
        "skipDebugOutput",
        "stopIfFail",
    };

    /// <summary>Module fixed output keys that must not receive a <c>var:</c> prefix on expand.</summary>
    private static readonly HashSet<string> FixedOutputBases = new(StringComparer.Ordinal)
    {
        "isSuccess",
    };

    /// <summary>
    /// Canonical write form: flatten legacy bags, strip leading <c>var:</c> from dynamic I/O keys.
    /// </summary>
    public static void MigrateToBareKeysInPlace(JObject root)
    {
        MigrateSteps(root["steps"] as JArray);
        if (root["subPrograms"] is JArray subs)
        {
            foreach (var sp in subs.OfType<JObject>())
            {
                MigrateToBareKeysInPlace(sp);
            }
        }
    }

    /// <summary>
    /// Expand bare dynamic keys (and leftover bags) to flat <c>var:*</c> for native ActionStep maps.
    /// </summary>
    public static void ExpandBareKeysToVarPrefixInPlace(JObject step)
    {
        ExpandMapOnStep(step, inputs: true, "inputs", "inputParams", "Inputs", "InputParams");
        ExpandMapOnStep(step, inputs: false, "outputs", "outputParams", "Outputs", "OutputParams");
    }

    /// <summary>
    /// Enumerate dynamic input bindings for lint: bare keys and legacy <c>var:*</c> (and bag interiors).
    /// </summary>
    public static IEnumerable<(string[] PathSegments, string VariableKey, JToken Value)> EnumerateDynamicInputs(
        JObject inputs)
    {
        if (inputs["in"] is JObject bag)
        {
            foreach (var prop in bag.Properties())
            {
                var variableKey = StripBindingSuffix(prop.Name);
                if (variableKey.Length == 0)
                {
                    continue;
                }

                yield return (["in", prop.Name], variableKey, prop.Value);
            }
        }

        foreach (var prop in inputs.Properties())
        {
            if (string.Equals(prop.Name, "in", StringComparison.Ordinal))
            {
                continue;
            }

            if (!TryGetDynamicVariableKey(prop.Name, inputs: true, out var variableKey))
            {
                continue;
            }

            yield return ([prop.Name], variableKey, prop.Value);
        }
    }

    /// <summary>Enumerate dynamic output bindings for lint.</summary>
    public static IEnumerable<(string[] PathSegments, string VariableKey, JToken Value)> EnumerateDynamicOutputs(
        JObject outputs)
    {
        if (outputs["out"] is JObject bag)
        {
            foreach (var prop in bag.Properties())
            {
                var variableKey = StripBindingSuffix(prop.Name);
                if (variableKey.Length == 0)
                {
                    continue;
                }

                yield return (["out", prop.Name], variableKey, prop.Value);
            }
        }

        foreach (var prop in outputs.Properties())
        {
            if (string.Equals(prop.Name, "out", StringComparison.Ordinal))
            {
                continue;
            }

            if (!TryGetDynamicVariableKey(prop.Name, inputs: false, out var variableKey))
            {
                continue;
            }

            yield return ([prop.Name], variableKey, prop.Value);
        }
    }

    public static bool IsSubProgramStep(JObject step)
    {
        var key = AgentStepWireAliases.ReadRunnerKey(step).Trim();
        return string.Equals(key, SubProgramRunnerKey, StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsFixedInputBase(string name) =>
        FixedInputBases.Contains(StripBindingSuffix(name));

    public static bool IsFixedOutputBase(string name) =>
        FixedOutputBases.Contains(StripBindingSuffix(name));

    public static string StripBindingSuffix(string name)
    {
        if (name.EndsWith(".var", StringComparison.Ordinal))
        {
            return name.Substring(0, name.Length - 4);
        }

        if (name.EndsWith(".file", StringComparison.Ordinal))
        {
            return name.Substring(0, name.Length - 5);
        }

        return name;
    }

    private static bool TryGetDynamicVariableKey(string wireKey, bool inputs, out string variableKey)
    {
        variableKey = string.Empty;
        var parameterKey = StripBindingSuffix(wireKey);
        if (parameterKey.StartsWith(VarKeyPrefix, StringComparison.Ordinal))
        {
            variableKey = parameterKey.Substring(VarKeyPrefix.Length);
            return variableKey.Length > 0;
        }

        if (inputs ? IsFixedInputBase(parameterKey) : IsFixedOutputBase(parameterKey))
        {
            return false;
        }

        variableKey = parameterKey;
        return variableKey.Length > 0;
    }

    private static void MigrateSteps(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var step in steps.OfType<JObject>())
        {
            if (IsSubProgramStep(step) || ProgramSourceSubProgramStepSugar.HasElevatedTarget(step))
            {
                if (!IsSubProgramStep(step) && ProgramSourceSubProgramStepSugar.HasElevatedTarget(step))
                {
                    step["key"] = SubProgramRunnerKey;
                }

                ProgramSourceSubProgramStepSugar.LiftModuleTargetToStepInPlace(step);

                if (AgentStepWireAliases.ReadInputMap(step) is JObject inputs)
                {
                    FlattenBag(inputs, "in");
                    StripVarPrefix(inputs, inputs: true);
                }

                if (AgentStepWireAliases.ReadOutputMap(step) is JObject outputs)
                {
                    FlattenBag(outputs, "out");
                    StripVarPrefix(outputs, inputs: false);
                }
            }

            MigrateSteps(step["ifSteps"] as JArray);
            MigrateSteps(step["elseSteps"] as JArray);
            MigrateSteps(step["IfSteps"] as JArray);
            MigrateSteps(step["ElseSteps"] as JArray);
        }
    }

    private static void FlattenBag(JObject map, string bagKey)
    {
        if (map[bagKey] is not JObject bag)
        {
            return;
        }

        foreach (var prop in bag.Properties())
        {
            if (prop.Value is JObject valueForm
                && valueForm["var"] is not null
                && valueForm.Count == 1)
            {
                var wireKey = prop.Name.EndsWith(".var", StringComparison.Ordinal)
                    ? prop.Name
                    : prop.Name + ".var";
                if (!map.ContainsKey(wireKey))
                {
                    map[wireKey] = valueForm["var"]!.DeepClone();
                }

                continue;
            }

            if (prop.Value is JObject fileForm
                && fileForm["file"] is not null
                && fileForm.Count == 1)
            {
                var wireKey = prop.Name.EndsWith(".file", StringComparison.Ordinal)
                    ? prop.Name
                    : prop.Name + ".file";
                if (!map.ContainsKey(wireKey))
                {
                    map[wireKey] = fileForm["file"]!.DeepClone();
                }

                continue;
            }

            if (!map.ContainsKey(prop.Name))
            {
                map[prop.Name] = prop.Value.DeepClone();
            }
        }

        map.Remove(bagKey);
    }

    private static void StripVarPrefix(JObject map, bool inputs)
    {
        var result = new JObject();
        foreach (var prop in map.Properties().OrderBy(p => p.Name, StringComparer.Ordinal))
        {
            var name = prop.Name;
            if (!name.StartsWith(VarKeyPrefix, StringComparison.Ordinal))
            {
                if (result.ContainsKey(name))
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.MixedBind,
                        $"Duplicate subprogram I/O key '{name}'.");
                }

                result[name] = prop.Value.DeepClone();
                continue;
            }

            var bare = name.Substring(VarKeyPrefix.Length);
            if (bare.Length == 0
                || (inputs ? IsFixedInputBase(bare) : IsFixedOutputBase(bare))
                || result.ContainsKey(bare)
                || result.ContainsKey(name))
            {
                if (result.ContainsKey(name))
                {
                    throw new ProgramSourceException(
                        ProgramSourceCodes.MixedBind,
                        $"Duplicate subprogram I/O key '{name}'.");
                }

                result[name] = prop.Value.DeepClone();
                continue;
            }

            result[bare] = prop.Value.DeepClone();
        }

        map.RemoveAll();
        foreach (var prop in result.Properties())
        {
            map[prop.Name] = prop.Value;
        }
    }

    private static void ExpandMapOnStep(JObject step, bool inputs, params string[] mapNames)
    {
        foreach (var mapName in mapNames)
        {
            if (step[mapName] is not JObject map)
            {
                continue;
            }

            FlattenBag(map, inputs ? "in" : "out");
            ExpandVarPrefix(map, inputs);
        }
    }

    private static void ExpandVarPrefix(JObject map, bool inputs)
    {
        var result = new JObject();
        foreach (var prop in map.Properties().OrderBy(p => p.Name, StringComparer.Ordinal))
        {
            var name = prop.Name;
            string target;
            if (name.StartsWith(VarKeyPrefix, StringComparison.Ordinal))
            {
                target = name;
            }
            else if (inputs ? IsFixedInputBase(name) : IsFixedOutputBase(name))
            {
                target = name;
            }
            else
            {
                target = VarKeyPrefix + name;
            }

            if (result.ContainsKey(target))
            {
                throw new ProgramSourceException(
                    ProgramSourceCodes.MixedBind,
                    $"Duplicate subprogram I/O key '{target}' (from '{name}').");
            }

            result[target] = prop.Value.DeepClone();
        }

        map.RemoveAll();
        foreach (var prop in result.Properties())
        {
            map[prop.Name] = prop.Value;
        }
    }
}
