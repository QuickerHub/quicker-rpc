using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.AgentModel.XAction.Compression;

/// <summary>
/// Read-only compressed view of an XAction program for agents. Full compression parses native XAction via
/// <see cref="XActionDataJsonParser"/> (x_action_program.proto) and emits agent wire JSON from agent_compressed_program.proto.
/// Patch/ephemeral-id helpers still operate on <see cref="JArray"/> for round-trip editing.
/// </summary>
public static class XActionCompressor
{
    public static JObject Compress(
        JArray steps,
        JArray variables,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var native = XActionDataJsonParser.ParseProgramBody(steps, variables);
        var compressed = TypedXActionCompressor.CompressProgram(native, catalog, omitDefaultLiteralInputs);
        var result = AgentCompressedProgramJson.ToJObject(compressed);
        if (result["variables"] is JArray variablesOut)
        {
            VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(variablesOut);
        }

        return result;
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

    /// <summary>
    /// Quicker stores XAction JSON with PascalCase property names; the agent wire format uses camelCase.
    /// Call before compress / patch when the body came from <see cref="Newtonsoft.Json"/> default serialization.
    /// </summary>
    public static void NormalizeQuickerWireNames(JArray steps, JArray? variables = null)
    {
        NormalizeStepsWireNamesRecursive(steps);
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is JObject variableObj)
            {
                NormalizeVariablePropertyNames(variableObj);
            }
        }
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
        var native = XActionDataJsonParser.ParseProgramBody(new JArray(), variables);
        var outVariables = new JArray();
        foreach (var variable in native.Variables)
        {
            outVariables.Add(CompressVariable(variable));
        }

        VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(outVariables);
        return outVariables;
    }

    public static JObject CompressVariable(JObject variableObj)
    {
        var native = XActionDataJsonParser.ParseProgramBody(
            new JArray(),
            new JArray { variableObj });
        if (native.Variables.Count == 0)
        {
            return new JObject();
        }

        return CompressVariable(native.Variables[0]);
    }

    public static JObject CompressVariable(QuickerRpc.AgentModel.Proto.V1.XVariableData variable)
    {
        var result = AgentCompressedProgramJson.ToJObject(TypedXActionCompressor.CompressVariable(variable));
        VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(result);
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
        VariableDefaultValueNormalizer.EnsureQuickerRuntimeDefaults(result);
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
        RenameIfPresent(variableObj, "Key", "key");
        RenameIfPresent(variableObj, "Type", "type");
        RenameIfPresent(variableObj, "Id", "id");
        RenameIfPresent(variableObj, "Desc", "desc");
        RenameIfPresent(variableObj, "DefaultValue", "defaultValue");
        RenameIfPresent(variableObj, "IsLocked", "isLocked");
        RenameIfPresent(variableObj, "SaveState", "saveState");
        RenameIfPresent(variableObj, "IsInput", "isInput");
        RenameIfPresent(variableObj, "IsOutput", "isOutput");
        RenameIfPresent(variableObj, "ParamName", "paramName");
        RenameIfPresent(variableObj, "CustomType", "customType");
        RenameIfPresent(variableObj, "Group", "group");

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
        var native = XActionDataJsonParser.ParseProgramBody(new JArray { step }, new JArray());
        if (native.Steps.Count == 0)
        {
            return new JObject();
        }

        return AgentCompressedProgramJson.ToJObject(
            TypedXActionCompressor.CompressStep(native.Steps[0], catalog, omitDefaultLiteralInputs));
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

    private static void NormalizePropertyNames(JObject step)
    {
        RenameIfPresent(step, "step_runner_key", "stepRunnerKey");
        RenameIfPresent(step, "input_params", "inputParams");
        RenameIfPresent(step, "output_params", "outputParams");
        RenameIfPresent(step, "if_steps", "ifSteps");
        RenameIfPresent(step, "else_steps", "elseSteps");
        RenameIfPresent(step, "delay_ms", "delayMs");
        RenameIfPresent(step, "step_id", "stepId");
        RenameIfPresent(step, "StepRunnerKey", "stepRunnerKey");
        RenameIfPresent(step, "InputParams", "inputParams");
        RenameIfPresent(step, "OutputParams", "outputParams");
        RenameIfPresent(step, "IfSteps", "ifSteps");
        RenameIfPresent(step, "ElseSteps", "elseSteps");
        RenameIfPresent(step, "DelayMs", "delayMs");
        RenameIfPresent(step, "StepId", "stepId");
        RenameIfPresent(step, "Disabled", "disabled");
        RenameIfPresent(step, "Collapsed", "collapsed");
        RenameIfPresent(step, "Note", "note");
    }

    private static void RenameIfPresent(JObject o, string from, string to)
    {
        if (o.Property(from) != null && o.Property(to) == null)
        {
            o[to] = o[from]!;
            o.Remove(from);
        }
    }

    private static void NormalizeParamNames(JObject paramObj)
    {
        RenameIfPresent(paramObj, "var_key", "varKey");
        RenameIfPresent(paramObj, "VarKey", "varKey");
        RenameIfPresent(paramObj, "Value", "value");
    }

    private static void NormalizeStepsWireNamesRecursive(JArray steps)
    {
        foreach (var token in steps)
        {
            if (token is not JObject stepObj)
            {
                continue;
            }

            NormalizePropertyNames(stepObj);
            if (stepObj["inputParams"] is JObject inputObj)
            {
                foreach (var prop in inputObj.Properties())
                {
                    if (prop.Value is JObject paramObj)
                    {
                        NormalizeParamNames(paramObj);
                    }
                }
            }

            if (stepObj["ifSteps"] is JArray ifSteps)
            {
                NormalizeStepsWireNamesRecursive(ifSteps);
            }

            if (stepObj["elseSteps"] is JArray elseSteps)
            {
                NormalizeStepsWireNamesRecursive(elseSteps);
            }
        }
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

            var key = variableObj["key"]?.ToString() ?? string.Empty;
            var entry = new JObject
            {
                ["key"] = key
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

            if (!string.IsNullOrWhiteSpace(key))
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
