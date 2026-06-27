using System;
using System.Linq;
using Google.Protobuf;
using Google.Protobuf.Collections;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Parses Quicker native XAction JSON (PascalCase, x_action_program.proto) into <see cref="XActionData"/>.
/// Normalizes null map entries before <see cref="JsonParser"/> (parity with Quicker.DesignerHost).
/// </summary>
public static class XActionDataJsonParser
{
    private static readonly JsonParser Parser = new(
        JsonParser.Settings.Default.WithIgnoreUnknownFields(true));

    public static XActionData ParseProgramBody(JArray steps, JArray variables)
    {
        var stepsClone = (JArray)steps.DeepClone();
        InputParamWireCoercer.ExpandStepsRecursive(stepsClone);
        var wrapper = new JObject
        {
            ["Steps"] = XActionWireJsonNormalizer.ToNativeStepsArray(stepsClone),
            ["Variables"] = XActionWireJsonNormalizer.ToNativeVariablesArray(variables),
            ["LimitSingleInstance"] = false,
            ["SummaryExpression"] = string.Empty,
        };

        return ParseNativeXActionJson(JTokenCompat.Compact(wrapper));
    }

    public static XActionData ParseNativeXActionJson(string json)
    {
        var normalized = NormalizeNativeXActionJsonForProto(json);
        var data = Parser.Parse<XActionData>(normalized);
        DecodeXActionDataMapKeys(data);
        return data;
    }

    private static string NormalizeNativeXActionJsonForProto(string data)
    {
        var root = JToken.Parse(data);
        if (root.Type != JTokenType.Object)
        {
            return data;
        }

        var o = (JObject)root;
        NormalizeSubProgramsArray(o["SubPrograms"] as JArray);
        NormalizeStepsArray(o["Steps"] as JArray);
        return JTokenCompat.Compact(o);
    }

    private static void NormalizeSubProgramsArray(JArray? subPrograms)
    {
        if (subPrograms is null)
        {
            return;
        }

        foreach (var token in subPrograms)
        {
            if (token is not JObject sub)
            {
                continue;
            }

            NormalizeStepsArray(sub["Steps"] as JArray);
            NormalizeSubProgramsArray(sub["SubPrograms"] as JArray);
        }
    }

    private static void NormalizeStepsArray(JArray? steps)
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

            NormalizeInputParamsObject(step["InputParams"] as JObject);
            NormalizeOutputParamsObject(step["OutputParams"] as JObject);
            EscapeStepMapKeysForProtoJson(step);
            NormalizeStepsArray(step["IfSteps"] as JArray);
            NormalizeStepsArray(step["ElseSteps"] as JArray);
        }
    }

    private static void EscapeStepMapKeysForProtoJson(JObject step)
    {
        EscapeParamMapKeys(step["InputParams"] as JObject);
        EscapeParamMapKeys(step["OutputParams"] as JObject);
    }

    private static void EscapeParamMapKeys(JObject? map)
    {
        if (map is null)
        {
            return;
        }

        foreach (var prop in map.Properties().ToList())
        {
            var encoded = ProtoMapKeyEscaping.Encode(prop.Name);
            if (string.Equals(encoded, prop.Name, StringComparison.Ordinal))
            {
                continue;
            }

            map[encoded] = prop.Value?.DeepClone();
            map.Remove(prop.Name);
        }
    }

    private static void DecodeXActionDataMapKeys(XActionData data)
    {
        foreach (var step in data.Steps)
        {
            DecodeStepMapKeys(step);
        }

        foreach (var subProgram in data.SubPrograms)
        {
            foreach (var step in subProgram.Steps)
            {
                DecodeStepMapKeys(step);
            }
        }
    }

    private static void DecodeStepMapKeys(XStepData step)
    {
        DecodeInputParamMapKeys(step.InputParams);
        DecodeStringMapKeys(step.OutputParams);
        foreach (var child in step.IfSteps)
        {
            DecodeStepMapKeys(child);
        }

        foreach (var child in step.ElseSteps)
        {
            DecodeStepMapKeys(child);
        }
    }

    private static void DecodeInputParamMapKeys(MapField<string, XStepParamData> map)
    {
        foreach (var key in map.Keys.ToList())
        {
            var decoded = ProtoMapKeyEscaping.Decode(key);
            if (string.Equals(decoded, key, StringComparison.Ordinal))
            {
                continue;
            }

            map[decoded] = map[key];
            map.Remove(key);
        }
    }

    private static void DecodeStringMapKeys(MapField<string, string> map)
    {
        foreach (var key in map.Keys.ToList())
        {
            var decoded = ProtoMapKeyEscaping.Decode(key);
            if (string.Equals(decoded, key, StringComparison.Ordinal))
            {
                continue;
            }

            map[decoded] = map[key];
            map.Remove(key);
        }
    }

    private static void NormalizeInputParamsObject(JObject? inputParams)
    {
        if (inputParams is null)
        {
            return;
        }

        foreach (var prop in inputParams.Properties().ToList())
        {
            var v = prop.Value;
            if (v is null || v.Type == JTokenType.Null || v.Type == JTokenType.Undefined)
            {
                prop.Value = new JObject();
                continue;
            }

            if (v is not JObject p)
            {
                prop.Value = InputParamWireCoercer.CoerceToParamObject(v);
                continue;
            }

            prop.Value = ToProtoJsonParamObject(p);
        }
    }

    /// <summary>Emit PascalCase bind fields expected by x_action_program.proto JsonParser.</summary>
    private static JObject ToProtoJsonParamObject(JObject obj)
    {
        var normalized = InputParamWireCoercer.NormalizeParamBindObject(obj);
        var result = new JObject();
        var varKey = normalized["varKey"]?.Type == JTokenType.String
            ? normalized["varKey"]!.Value<string>()?.Trim()
            : null;
        var value = normalized["value"]?.Type == JTokenType.String
            ? normalized["value"]!.Value<string>()
            : normalized["value"]?.ToString();
        if (!string.IsNullOrEmpty(varKey))
        {
            result["VarKey"] = varKey;
        }

        if (value is not null)
        {
            result["Value"] = value;
        }

        return result;
    }

    private static void NormalizeOutputParamsObject(JObject? outputParams)
    {
        if (outputParams is null)
        {
            return;
        }

        foreach (var prop in outputParams.Properties().ToList())
        {
            var v = prop.Value;
            if (v is null || v.Type == JTokenType.Null || v.Type == JTokenType.Undefined)
            {
                prop.Value = string.Empty;
            }
        }
    }

}
