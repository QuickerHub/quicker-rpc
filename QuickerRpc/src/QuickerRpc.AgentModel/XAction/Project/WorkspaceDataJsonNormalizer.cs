using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Canonical cleanup for workspace <c>data.json</c> before writing to disk.</summary>
public static class WorkspaceDataJsonNormalizer
{
    public static void NormalizeForDisk(JObject data, StepRunnerCatalog? catalog = null)
    {
        NormalizeStepsForDisk(data["steps"] as JArray, catalog);
        NormalizeVariablesForDisk(data["variables"] as JArray);
    }

    /// <summary>
    /// After short-form compact: drop presentation defaults and empty maps so checkout matches agent wire.
    /// </summary>
    public static void FinalizeCompactWire(JObject data)
    {
        FinalizeSteps(data["steps"] as JArray);
        FinalizeVariables(data["variables"] as JArray);
    }

    private static void NormalizeStepsForDisk(JArray? steps, StepRunnerCatalog? catalog)
    {
        if (steps is null)
        {
            return;
        }

        // Expand short-form / *.var / *.file so omit-default and compact operate on bind objects.
        InputParamWireCoercer.ExpandStepsRecursive(steps);
        NormalizeStepsForDiskCore(steps, catalog);
    }

    private static void NormalizeStepsForDiskCore(JArray steps, StepRunnerCatalog? catalog)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            RemoveStepIds(step);
            OmitDefaultPresentationFields(step);
            OmitDefaultInputParams(step, catalog);
            if (step["ifSteps"] is JArray ifSteps)
            {
                NormalizeStepsForDiskCore(ifSteps, catalog);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                NormalizeStepsForDiskCore(elseSteps, catalog);
            }
        }
    }

    private static void NormalizeVariablesForDisk(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is not JObject variable)
            {
                continue;
            }

            variable.Remove("id");
            variable.Remove("Id");
        }
    }

    private static void FinalizeSteps(JArray? steps)
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

            OmitDefaultPresentationFields(step);
            OmitEmptyMap(step, "inputs");
            OmitEmptyMap(step, "outputs");
            OmitEmptyMap(step, "inputParams");
            OmitEmptyMap(step, "outputParams");
            OmitEmptyArray(step, "ifSteps");
            OmitEmptyArray(step, "elseSteps");

            if (step["ifSteps"] is JArray ifSteps)
            {
                FinalizeSteps(ifSteps);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                FinalizeSteps(elseSteps);
            }
        }
    }

    private static void FinalizeVariables(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is not JObject variable)
            {
                continue;
            }

            OmitBoolIfFalse(variable, "isLocked");
            OmitBoolIfFalse(variable, "saveState");
            OmitBoolIfFalse(variable, "isInput");
            OmitBoolIfFalse(variable, "isOutput");
            OmitStringIfEmpty(variable, "desc");
            OmitStringIfEmpty(variable, "paramName");
            OmitStringIfEmpty(variable, "group");
            OmitEmptyMap(variable, "inputParamInfo");
            OmitEmptyMap(variable, "outputParamInfo");
            OmitEmptyMap(variable, "tableDef");
        }
    }

    private static void RemoveStepIds(JObject step)
    {
        step.Remove("stepId");
        step.Remove("StepId");
    }

    private static void OmitDefaultPresentationFields(JObject step)
    {
        OmitBoolIfFalse(step, "disabled");
        OmitBoolIfFalse(step, "Disabled");
        OmitBoolIfFalse(step, "collapsed");
        OmitBoolIfFalse(step, "Collapsed");

        if (IsZeroNumber(step["delayMs"]) || IsZeroNumber(step["DelayMs"]))
        {
            step.Remove("delayMs");
            step.Remove("DelayMs");
        }

        OmitStringIfEmpty(step, "note");
        OmitStringIfEmpty(step, "Note");
    }

    private static void OmitDefaultInputParams(JObject step, StepRunnerCatalog? catalog)
    {
        if (catalog is null)
        {
            return;
        }

        var inputParams = AgentStepWireAliases.ReadInputMap(step);
        if (inputParams is null)
        {
            return;
        }

        var runnerKey = AgentStepWireAliases.ReadRunnerKey(step);
        var runner = catalog.TryFind(runnerKey);
        if (runner is null)
        {
            return;
        }

        var defs = runner.InputParamDefs
            .Where(p => !string.IsNullOrWhiteSpace(p.Key))
            .GroupBy(p => p.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        foreach (var prop in inputParams.Properties().ToList())
        {
            if (!defs.TryGetValue(prop.Name, out var def) || def.IsControlField)
            {
                continue;
            }

            if (prop.Value is not JObject paramObj
                || HasNonLiteralBinding(paramObj)
                || !TryReadValueForDefaultCompare(paramObj["value"] ?? paramObj["Value"], out var actual))
            {
                continue;
            }

            var expected = XActionCompressor.SerializeDefaultForComparison(def.DefaultValue);
            if (string.Equals(expected, actual, StringComparison.Ordinal))
            {
                prop.Remove();
            }
        }
    }

    private static bool HasNonLiteralBinding(JObject paramObj) =>
        HasNonEmptyString(paramObj["varKey"] ?? paramObj["VarKey"])
        || HasNonEmptyString(paramObj["file"] ?? paramObj["File"]);

    private static bool HasNonEmptyString(JToken? token) =>
        token?.Type == JTokenType.String && !string.IsNullOrEmpty(token.Value<string>());

    private static bool TryReadValueForDefaultCompare(JToken? token, out string value)
    {
        value = string.Empty;
        if (token is null || token.Type is JTokenType.Null or JTokenType.Undefined)
        {
            return true;
        }

        switch (token.Type)
        {
            case JTokenType.String:
                value = token.Value<string>() ?? string.Empty;
                return value.IndexOf('$') < 0;
            case JTokenType.Boolean:
                value = token.Value<bool>() ? "true" : "false";
                return true;
            case JTokenType.Integer:
                value = token.Value<long>().ToString(CultureInfo.InvariantCulture);
                return true;
            case JTokenType.Float:
                value = token.Value<double>().ToString("G", CultureInfo.InvariantCulture);
                return true;
            default:
                return false;
        }
    }

    private static void OmitEmptyMap(JObject parent, string key)
    {
        if (parent[key] is JObject map && !map.Properties().Any())
        {
            parent.Remove(key);
        }
    }

    private static void OmitEmptyArray(JObject parent, string key)
    {
        if (parent[key] is JArray array && array.Count == 0)
        {
            parent.Remove(key);
        }
    }

    private static void OmitBoolIfFalse(JObject obj, string key)
    {
        if (obj[key]?.Type == JTokenType.Boolean && obj.Value<bool>(key) == false)
        {
            obj.Remove(key);
        }
    }

    private static void OmitStringIfEmpty(JObject obj, string key)
    {
        if (obj[key]?.Type == JTokenType.String
            && string.IsNullOrEmpty(obj.Value<string>(key)))
        {
            obj.Remove(key);
        }
    }

    private static bool IsZeroNumber(JToken? token) =>
        token is not null
        && token.Type is JTokenType.Integer or JTokenType.Float
        && Math.Abs(token.Value<double>()) < double.Epsilon;
}
