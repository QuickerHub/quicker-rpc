using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.AgentModel.XAction.Compression;

/// <summary>
/// Read-only compressed view of an XAction program for agents (parity with
/// <c>Quicker.ActionDesigner.Backend.XActionCompression</c> using protobuf <see cref="StepRunnerCatalog"/> instead of
/// <c>IStepRunnerService</c>).
/// </summary>
public static class XActionCompressor
{
    public static JObject Compress(
        JArray steps,
        JArray variables,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var outSteps = new JArray();
        foreach (var token in steps)
        {
            if (token is JObject stepObj)
            {
                outSteps.Add(CompressStep(stepObj, catalog, omitDefaultLiteralInputs));
            }
            else
            {
                outSteps.Add(token);
            }
        }

        return new JObject
        {
            ["steps"] = outSteps,
            ["variables"] = CompressVariables(variables)
        };
    }

    public static JObject CompressStructure(JArray steps, JArray variables)
    {
        return new JObject
        {
            ["steps"] = CompressStructureStepArray(steps),
            ["variables"] = CompressStructureVariables(variables)
        };
    }

    public static JObject CompressMetadata(
        JArray steps,
        JArray variables,
        string? title,
        string? description,
        string? icon,
        int subProgramCount)
    {
        return new JObject
        {
            ["title"] = title ?? string.Empty,
            ["description"] = description ?? string.Empty,
            ["icon"] = icon ?? string.Empty,
            ["stepCount"] = CountStepsRecursive(steps),
            ["variableCount"] = variables.Count,
            ["subProgramCount"] = subProgramCount,
            ["variableKeys"] = CollectVariableKeys(variables),
            ["stepOutline"] = BuildStepOutline(steps, nodePathPrefix: null)
        };
    }

    public static void EnsureEphemeralStepIds(JArray rootSteps)
    {
        var counter = 1;
        EnsureEphemeralStepIdsRecursive(rootSteps, ref counter);
    }

    public static void EnsureEphemeralVariableIds(JArray variables)
    {
        var counter = 1;
        foreach (var token in variables)
        {
            if (token is not JObject variableObj)
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(variableObj["id"]?.ToString()))
            {
                variableObj["id"] = $"v-{counter}";
            }

            counter++;
        }
    }

    public static JArray CompressVariables(JArray variables)
    {
        var outVariables = new JArray();
        foreach (var token in variables)
        {
            if (token is JObject variableObj)
            {
                outVariables.Add(CompressVariable(variableObj));
            }
            else
            {
                outVariables.Add(token);
            }
        }

        return outVariables;
    }

    public static JObject CompressVariable(JObject variableObj)
    {
        var result = (JObject)variableObj.DeepClone();
        NormalizeVariablePropertyNames(result);

        if (!TryReadVarType(result["varType"], out var numericVarType))
        {
            numericVarType = 0;
        }

        result.Remove("type");
        result.Remove("var_type");
        result.Remove("csharpType");

        var varTypeName = ResolveVariableVarTypeName(numericVarType);
        if (!string.Equals(varTypeName, "text", StringComparison.Ordinal))
        {
            result["varType"] = varTypeName;
        }
        else
        {
            result.Remove("varType");
        }

        OmitDefaultVariableFields(result);
        OmitEmptyVariableNestedObjects(result);
        return result;
    }

    public static JArray NormalizeVariablesForSave(JArray variables)
    {
        var result = new JArray();
        foreach (var token in variables)
        {
            if (token is JObject variableObj)
            {
                result.Add(NormalizeVariableForSave(variableObj));
            }
            else
            {
                result.Add(token);
            }
        }

        return result;
    }

    public static JObject NormalizeVariableForSave(JObject variableObj)
    {
        var result = (JObject)variableObj.DeepClone();
        NormalizeVariablePropertyNames(result);

        if (!TryReadVarType(result["varType"], out var numericVarType))
        {
            numericVarType = 0;
        }

        result["type"] = numericVarType;
        result.Remove("varType");
        result.Remove("var_type");
        result.Remove("csharpType");
        return result;
    }

    private static void NormalizeVariablePropertyNames(JObject variableObj)
    {
        RenameIfPresent(variableObj, "var_type", "varType");
        RenameIfPresent(variableObj, "default_value", "defaultValue");
        RenameIfPresent(variableObj, "is_locked", "isLocked");
        RenameIfPresent(variableObj, "save_state", "saveState");
        RenameIfPresent(variableObj, "is_input", "isInput");
        RenameIfPresent(variableObj, "is_output", "isOutput");
        RenameIfPresent(variableObj, "param_name", "paramName");
        RenameIfPresent(variableObj, "custom_type", "customType");
        RenameIfPresent(variableObj, "input_param_info", "inputParamInfo");
        RenameIfPresent(variableObj, "output_param_info", "outputParamInfo");
        RenameIfPresent(variableObj, "table_def", "tableDef");

        if (variableObj["type"] != null && variableObj["varType"] == null)
        {
            variableObj["varType"] = variableObj["type"]!;
        }
    }

    private static void OmitDefaultVariableFields(JObject variableObj)
    {
        OmitBoolIfFalse(variableObj, "isLocked");
        OmitBoolIfFalse(variableObj, "saveState");
        OmitBoolIfFalse(variableObj, "isInput");
        OmitBoolIfFalse(variableObj, "isOutput");
        OmitStringIfEmpty(variableObj, "defaultValue");
        OmitStringIfEmpty(variableObj, "desc");
        OmitStringIfEmpty(variableObj, "paramName");
        OmitStringIfEmpty(variableObj, "group");
        OmitStringIfEmpty(variableObj, "customType");
    }

    private static void OmitEmptyVariableNestedObjects(JObject variableObj)
    {
        if (variableObj["inputParamInfo"] is JObject inputInfo && IsEmptyObject(inputInfo))
        {
            variableObj.Remove("inputParamInfo");
        }

        if (variableObj["outputParamInfo"] is JObject outputInfo && IsEmptyObject(outputInfo))
        {
            variableObj.Remove("outputParamInfo");
        }

        if (variableObj["tableDef"] is JObject tableDef
            && (IsEmptyObject(tableDef) || tableDef["fields"] is JArray { Count: 0 }))
        {
            variableObj.Remove("tableDef");
        }
    }

    private static void OmitBoolIfFalse(JObject obj, string key)
    {
        if (obj[key] is JValue { Type: JTokenType.Boolean } value && value.Value<bool>() == false)
        {
            obj.Remove(key);
        }
    }

    private static void OmitStringIfEmpty(JObject obj, string key)
    {
        var text = obj[key]?.Type == JTokenType.String ? obj[key]!.Value<string>() : null;
        if (string.IsNullOrEmpty(text))
        {
            obj.Remove(key);
        }
    }

    private static bool IsEmptyObject(JObject obj) => !obj.Properties().Any();

    private static string ResolveVariableVarTypeName(int varType)
    {
        return varType switch
        {
            0 => "text",
            1 => "number",
            2 => "boolean",
            3 => "image",
            4 => "list",
            6 => "dateTime",
            9 => "enum",
            10 => "dict",
            12 => "integer",
            13 => "table",
            _ => "object"
        };
    }

    private static bool TryReadVarType(JToken? token, out int varType)
    {
        varType = 0;
        if (token == null)
        {
            return false;
        }

        switch (token.Type)
        {
            case JTokenType.Integer:
                varType = token.Value<int>();
                return true;
            case JTokenType.String:
                var raw = token.Value<string>()?.Trim() ?? string.Empty;
                if (int.TryParse(raw, out varType))
                {
                    return true;
                }

                return raw.ToLowerInvariant() switch
                {
                    "text" => ReturnVarType(0, out varType),
                    "number" => ReturnVarType(1, out varType),
                    "boolean" => ReturnVarType(2, out varType),
                    "image" => ReturnVarType(3, out varType),
                    "list" => ReturnVarType(4, out varType),
                    "datetime" => ReturnVarType(6, out varType),
                    "enum" => ReturnVarType(9, out varType),
                    "dict" => ReturnVarType(10, out varType),
                    "integer" => ReturnVarType(12, out varType),
                    "table" => ReturnVarType(13, out varType),
                    _ => false
                };
            default:
                return false;
        }
    }

    private static bool ReturnVarType(int value, out int varType)
    {
        varType = value;
        return true;
    }

    public static JObject CompressStep(
        JObject step,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var result = (JObject)step.DeepClone();
        NormalizePropertyNames(result);

        var runnerKey = result.Value<string>("stepRunnerKey") ?? "";
        var runner = omitDefaultLiteralInputs && !string.IsNullOrEmpty(runnerKey)
            ? TryFindRunnerItem(catalog, runnerKey)
            : null;

        var inputObj = result["inputParams"] as JObject ?? new JObject();
        var compressedInputs = CompressInputParams(inputObj, runner, omitDefaultLiteralInputs);
        if (compressedInputs.Count > 0)
        {
            result["inputParams"] = compressedInputs;
        }
        else
        {
            result.Remove("inputParams");
        }

        var outputObj = result["outputParams"] as JObject ?? new JObject();
        var compressedOutputs = CompressOutputParams(outputObj);
        if (compressedOutputs.Count > 0)
        {
            result["outputParams"] = compressedOutputs;
        }
        else
        {
            result.Remove("outputParams");
        }

        var ifArr = result["ifSteps"] as JArray ?? new JArray();
        var elseArr = result["elseSteps"] as JArray ?? new JArray();
        var compressedIf = CompressStepArray(ifArr, catalog, omitDefaultLiteralInputs);
        var compressedElse = CompressStepArray(elseArr, catalog, omitDefaultLiteralInputs);
        if (compressedIf.Count > 0)
        {
            result["ifSteps"] = compressedIf;
        }
        else
        {
            result.Remove("ifSteps");
        }

        if (compressedElse.Count > 0)
        {
            result["elseSteps"] = compressedElse;
        }
        else
        {
            result.Remove("elseSteps");
        }

        OmitDefaultPresentationFields(result);
        return result;
    }

    /// <summary>
    /// Drops agent-noise fields that match proto/editor defaults; missing keys round-trip as empty/false/0 on save.
    /// </summary>
    private static void OmitDefaultPresentationFields(JObject step)
    {
        if (step["disabled"] is JValue { Type: JTokenType.Boolean } disabled
            && disabled.Value<bool>() == false)
        {
            step.Remove("disabled");
        }

        if (step["collapsed"] is JValue { Type: JTokenType.Boolean } collapsed
            && collapsed.Value<bool>() == false)
        {
            step.Remove("collapsed");
        }

        if (step["delayMs"] is JValue { Type: JTokenType.Integer } delayMs
            && delayMs.Value<long>() == 0)
        {
            step.Remove("delayMs");
        }

        var note = step["note"]?.Type == JTokenType.String ? step["note"]!.Value<string>() : null;
        if (string.IsNullOrEmpty(note))
        {
            step.Remove("note");
        }
    }

    private static JArray CompressStepArray(JArray arr, StepRunnerCatalog catalog, bool omitDefaultLiteralInputs)
    {
        var o = new JArray();
        foreach (var token in arr)
        {
            if (token is JObject jo)
            {
                o.Add(CompressStep(jo, catalog, omitDefaultLiteralInputs));
            }
            else
            {
                o.Add(token);
            }
        }

        return o;
    }

    private static void NormalizePropertyNames(JObject step)
    {
        RenameIfPresent(step, "step_runner_key", "stepRunnerKey");
        RenameIfPresent(step, "input_params", "inputParams");
        RenameIfPresent(step, "output_params", "outputParams");
        RenameIfPresent(step, "if_steps", "ifSteps");
        RenameIfPresent(step, "else_steps", "elseSteps");
        RenameIfPresent(step, "delay_ms", "delayMs");
        RenameIfPresent(step, "step_id", "stepId");
    }

    private static void RenameIfPresent(JObject o, string from, string to)
    {
        if (o.Property(from) != null && o.Property(to) == null)
        {
            o[to] = o[from]!;
            o.Remove(from);
        }
    }

    private static JObject CompressInputParams(
        JObject inputParams,
        StepRunnerDefinition? runner,
        bool omitDefaultLiteralInputs)
    {
        var defsByKey = BuildParamDefIndex(runner);
        var result = new JObject();
        foreach (var prop in inputParams.Properties())
        {
            var key = prop.Name;
            if (prop.Value is not JObject paramObj)
            {
                continue;
            }

            NormalizeParamNames(paramObj);
            var varKey = paramObj.Value<string>("varKey") ?? "";
            var value = paramObj.Value<string>("value") ?? "";

            if (omitDefaultLiteralInputs
                && string.IsNullOrEmpty(varKey)
                && string.IsNullOrEmpty(value))
            {
                continue;
            }

            // Control fields (e.g. csscript "mode", runScript "type") identify step variant;
            // keep them in the read model even when value equals catalog default.
            if (omitDefaultLiteralInputs
                && string.IsNullOrEmpty(varKey)
                && TryGetParamDef(defsByKey, key, out var def)
                && !def.IsControlField
                && IsLiteralValue(value)
                && string.Equals(
                    SerializeDefaultForComparison(def.DefaultValue),
                    value,
                    StringComparison.Ordinal))
            {
                continue;
            }

            result[key] = CompressInputParamEntry(paramObj);
        }

        return result;
    }

    /// <summary>Omit empty <c>varKey</c> / <c>value</c>; include only non-empty sides of each param.</summary>
    private static JObject CompressInputParamEntry(JObject paramObj)
    {
        var varKey = paramObj.Value<string>("varKey") ?? "";
        var value = paramObj.Value<string>("value") ?? "";
        var compressed = new JObject();
        if (!string.IsNullOrEmpty(varKey))
        {
            compressed["varKey"] = varKey;
        }

        if (!string.IsNullOrEmpty(value))
        {
            compressed["value"] = value;
        }

        return compressed;
    }

    private static void NormalizeParamNames(JObject paramObj)
    {
        RenameIfPresent(paramObj, "var_key", "varKey");
    }

    private static Dictionary<string, StepRunnerInputParamDef> BuildParamDefIndex(StepRunnerDefinition? runner)
    {
        var d = new Dictionary<string, StepRunnerInputParamDef>(StringComparer.OrdinalIgnoreCase);
        if (runner == null)
        {
            return d;
        }

        foreach (var p in runner.InputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(p.Key))
            {
                continue;
            }

            if (!d.ContainsKey(p.Key))
            {
                d[p.Key] = p;
            }
        }

        return d;
    }

    private static bool TryGetParamDef(
        Dictionary<string, StepRunnerInputParamDef> defsByKey,
        string key,
        out StepRunnerInputParamDef def) =>
        defsByKey.TryGetValue(key, out def!);

    private static bool IsLiteralValue(string value) => value.IndexOf('$') < 0;

    private static JObject CompressOutputParams(JObject outputParams)
    {
        var result = new JObject();
        foreach (var prop in outputParams.Properties())
        {
            var s = prop.Value?.Type == JTokenType.String
                ? prop.Value.Value<string>() ?? ""
                : prop.Value?.ToString() ?? "";
            if (string.IsNullOrWhiteSpace(s))
            {
                continue;
            }

            result[prop.Name] = prop.Value;
        }

        return result;
    }

    public static string SerializeDefaultForComparison(string? defaultValue) =>
        defaultValue ?? string.Empty;

    private static StepRunnerDefinition? TryFindRunnerItem(StepRunnerCatalog catalog, string stepRunnerKey)
    {
        foreach (var it in catalog.Items)
        {
            if (string.Equals((it.Key ?? "").Trim(), stepRunnerKey, StringComparison.Ordinal))
            {
                return it;
            }
        }

        return null;
    }

    /// <summary>
    /// Rewrites <c>inputParams</c> keys to StepRunner catalog keys (case-insensitive), e.g. <c>MaxLines</c> -> <c>maxLines</c>.
    /// </summary>
    public static void NormalizeStepsInputParamKeys(JArray steps, StepRunnerCatalog? catalog)
    {
        if (catalog is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is JObject stepObj)
            {
                NormalizeStepInputParamKeys(stepObj, catalog);
            }
        }
    }

    private static void NormalizeStepInputParamKeys(JObject step, StepRunnerCatalog catalog)
    {
        NormalizePropertyNames(step);

        var runnerKey = step.Value<string>("stepRunnerKey") ?? "";
        var runner = TryFindRunnerItem(catalog, runnerKey);
        if (runner is not null && step["inputParams"] is JObject inputObj)
        {
            step["inputParams"] = CanonicalizeInputParamKeys(inputObj, runner);
        }

        if (step["ifSteps"] is JArray ifSteps)
        {
            NormalizeStepsInputParamKeys(ifSteps, catalog);
        }

        if (step["elseSteps"] is JArray elseSteps)
        {
            NormalizeStepsInputParamKeys(elseSteps, catalog);
        }
    }

    private static JObject CanonicalizeInputParamKeys(JObject inputParams, StepRunnerDefinition runner)
    {
        var canonicalByLower = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var def in runner.InputParamDefs)
        {
            if (string.IsNullOrWhiteSpace(def.Key))
            {
                continue;
            }

            canonicalByLower[def.Key] = def.Key;
        }

        var result = new JObject();
        foreach (var prop in inputParams.Properties())
        {
            if (prop.Value is not JObject paramObj)
            {
                continue;
            }

            var key = canonicalByLower.TryGetValue(prop.Name, out var canonical) ? canonical : prop.Name;
            if (result[key] is JObject existing)
            {
                if (IsEmptyParamEntry(existing) && !IsEmptyParamEntry(paramObj))
                {
                    result[key] = (JObject)paramObj.DeepClone();
                }
            }
            else
            {
                result[key] = (JObject)paramObj.DeepClone();
            }
        }

        return result;
    }

    private static bool IsEmptyParamEntry(JObject paramObj)
    {
        var varKey = paramObj.Value<string>("varKey") ?? "";
        var value = paramObj.Value<string>("value") ?? "";
        return string.IsNullOrEmpty(varKey) && string.IsNullOrEmpty(value);
    }

    private static JArray CompressStructureStepArray(JArray arr)
    {
        var output = new JArray();
        foreach (var token in arr)
        {
            if (token is JObject stepObj)
            {
                output.Add(CompressStructureStep(stepObj));
            }
            else
            {
                output.Add(token);
            }
        }

        return output;
    }

    private static JObject CompressStructureStep(JObject step)
    {
        var result = (JObject)step.DeepClone();
        NormalizePropertyNames(result);
        result.Remove("inputParams");
        result.Remove("input_params");
        result.Remove("outputParams");
        result.Remove("output_params");

        var ifArr = result["ifSteps"] as JArray ?? new JArray();
        var elseArr = result["elseSteps"] as JArray ?? new JArray();
        var compressedIf = CompressStructureStepArray(ifArr);
        var compressedElse = CompressStructureStepArray(elseArr);
        if (compressedIf.Count > 0)
        {
            result["ifSteps"] = compressedIf;
        }
        else
        {
            result.Remove("ifSteps");
        }

        if (compressedElse.Count > 0)
        {
            result["elseSteps"] = compressedElse;
        }
        else
        {
            result.Remove("elseSteps");
        }

        OmitDefaultPresentationFields(result);
        return result;
    }

    private static JArray CompressStructureVariables(JArray variables)
    {
        var output = new JArray();
        foreach (var token in variables)
        {
            if (token is not JObject variableObj)
            {
                continue;
            }

            var entry = new JObject
            {
                ["id"] = variableObj["id"]?.ToString() ?? string.Empty,
                ["key"] = variableObj["key"]?.ToString() ?? string.Empty
            };

            if (!TryReadVarType(variableObj["varType"] ?? variableObj["type"], out var numericVarType))
            {
                numericVarType = 0;
            }

            var varTypeName = ResolveVariableVarTypeName(numericVarType);
            if (!string.Equals(varTypeName, "text", StringComparison.Ordinal))
            {
                entry["varType"] = varTypeName;
            }

            if (!string.IsNullOrWhiteSpace(entry["id"]?.ToString()) || !string.IsNullOrWhiteSpace(entry["key"]?.ToString()))
            {
                output.Add(entry);
            }
        }

        return output;
    }

    private static JArray BuildStepOutline(JArray steps, string? nodePathPrefix)
    {
        var outline = new JArray();
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject stepObj)
            {
                continue;
            }

            outline.Add(BuildStepOutlineEntry(stepObj, BuildNodePath(nodePathPrefix, i.ToString(CultureInfo.InvariantCulture))));
        }

        return outline;
    }

    private static JObject BuildStepOutlineEntry(JObject step, string nodePath)
    {
        NormalizePropertyNames(step);
        var entry = new JObject
        {
            ["stepId"] = step["stepId"]?.ToString() ?? string.Empty,
            ["stepRunnerKey"] = step["stepRunnerKey"]?.ToString() ?? string.Empty,
            ["nodePath"] = nodePath
        };

        var note = step["note"]?.Type == JTokenType.String ? step["note"]!.Value<string>() : null;
        if (!string.IsNullOrEmpty(note))
        {
            entry["note"] = note;
        }

        if (step["disabled"] is JValue { Type: JTokenType.Boolean } disabled && disabled.Value<bool>())
        {
            entry["disabled"] = true;
        }

        if (step["ifSteps"] is JArray { Count: > 0 } ifSteps)
        {
            entry["ifSteps"] = BuildStepOutline(ifSteps, $"{nodePath}/if");
        }

        if (step["elseSteps"] is JArray { Count: > 0 } elseSteps)
        {
            entry["elseSteps"] = BuildStepOutline(elseSteps, $"{nodePath}/else");
        }

        return entry;
    }

    private static string BuildNodePath(string? prefix, string segment) =>
        string.IsNullOrEmpty(prefix) ? segment : $"{prefix}/{segment}";

    private static int CountStepsRecursive(JArray steps)
    {
        var count = 0;
        foreach (var token in steps)
        {
            if (token is not JObject stepObj)
            {
                continue;
            }

            count++;
            if (stepObj["ifSteps"] is JArray ifSteps)
            {
                count += CountStepsRecursive(ifSteps);
            }

            if (stepObj["elseSteps"] is JArray elseSteps)
            {
                count += CountStepsRecursive(elseSteps);
            }
        }

        return count;
    }

    private static JArray CollectVariableKeys(JArray variables)
    {
        var keys = new JArray();
        foreach (var token in variables)
        {
            if (token is JObject variableObj)
            {
                var key = variableObj["key"]?.ToString();
                if (!string.IsNullOrWhiteSpace(key))
                {
                    keys.Add(key);
                }
            }
        }

        return keys;
    }

    private static void EnsureEphemeralStepIdsRecursive(JArray steps, ref int counter)
    {
        foreach (var token in steps)
        {
            if (token is not JObject stepObj)
            {
                continue;
            }

            NormalizePropertyNames(stepObj);
            if (string.IsNullOrWhiteSpace(stepObj["stepId"]?.ToString()))
            {
                stepObj["stepId"] = $"s-{counter}";
            }

            counter++;

            if (stepObj["ifSteps"] is JArray ifSteps)
            {
                EnsureEphemeralStepIdsRecursive(ifSteps, ref counter);
            }

            if (stepObj["elseSteps"] is JArray elseSteps)
            {
                EnsureEphemeralStepIdsRecursive(elseSteps, ref counter);
            }
        }
    }

}
