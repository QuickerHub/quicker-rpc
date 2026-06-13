using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Canonical cleanup for workspace <c>data.json</c> before writing to disk.</summary>
public static class WorkspaceDataJsonNormalizer
{
    public static void NormalizeForDisk(JObject data, StepRunnerCatalog? catalog = null)
    {
        NormalizeStepsForDisk(data["steps"] as JArray, catalog);
        NormalizeVariablesForDisk(data["variables"] as JArray);
    }

    private static void NormalizeStepsForDisk(JArray? steps, StepRunnerCatalog? catalog)
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

            RemoveStepIds(step);
            OmitDefaultInputParams(step, catalog);
            NormalizeStepsForDisk(step["ifSteps"] as JArray, catalog);
            NormalizeStepsForDisk(step["elseSteps"] as JArray, catalog);
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

    private static void RemoveStepIds(JObject step)
    {
        step.Remove("stepId");
        step.Remove("StepId");
    }

    private static void OmitDefaultInputParams(JObject step, StepRunnerCatalog? catalog)
    {
        if (catalog is null || step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        var runnerKey = step.Value<string>("stepRunnerKey")
            ?? step.Value<string>("StepRunnerKey")
            ?? string.Empty;
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
}
