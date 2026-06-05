using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// In-place fixes for older workspace <c>data.json</c> shapes when importing from Quicker (extract/export).
/// </summary>
public static class WorkspaceProgramCompatibility
{
    public static IReadOnlyList<string> Normalize(JObject data)
    {
        var fixes = new List<string>();
        if (data["variables"] is JArray variables)
        {
            NormalizeVariables(variables, fixes);
        }

        if (data["steps"] is JArray steps)
        {
            NormalizeSteps(steps, fixes);
        }

        return fixes;
    }

    private static void NormalizeVariables(JArray variables, IList<string> fixes)
    {
        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? "?";

            if (TryReadNonEmptyString(varObj[VariableDefaultValueRef.LegacyDefaultValueFileProperty], out var legacyPath))
            {
                VariableDefaultValueRef.MigrateLegacyFileProperty(varObj);
                fixes.Add(
                    $"variables[{key}]: defaultValueFile → defaultValue.file ({legacyPath})");
            }

            if (VariableDefaultValueNormalizer.RequiresEmptyStringDefault(varObj)
                && (!varObj.ContainsKey("defaultValue")
                    || varObj["defaultValue"] is null
                    || varObj["defaultValue"]!.Type == JTokenType.Null))
            {
                VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(varObj);
                fixes.Add($"variables[{key}]: defaultValue → \"\" (text/any must not init as null in Quicker)");
            }
        }
    }

    private static void NormalizeSteps(JArray steps, IList<string> fixes)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                NormalizeSteps(ifSteps, fixes);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                NormalizeSteps(elseSteps, fixes);
            }
        }
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
