using System.Linq;
using Google.Protobuf;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
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
        var wrapper = new JObject
        {
            ["Steps"] = XActionWireJsonNormalizer.ToNativeStepsArray(steps),
            ["Variables"] = XActionWireJsonNormalizer.ToNativeVariablesArray(variables),
            ["LimitSingleInstance"] = false,
            ["SummaryExpression"] = string.Empty,
        };

        return ParseNativeXActionJson(wrapper.ToString(Formatting.None));
    }

    public static XActionData ParseNativeXActionJson(string json)
    {
        var normalized = NormalizeNativeXActionJsonForProto(json);
        return Parser.Parse<XActionData>(normalized);
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
        return o.ToString(Formatting.None);
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
            NormalizeStepsArray(step["IfSteps"] as JArray);
            NormalizeStepsArray(step["ElseSteps"] as JArray);
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
                continue;
            }

            CoerceNullStringField(p, "VarKey");
            CoerceNullStringField(p, "Value");
        }
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

    private static void CoerceNullStringField(JObject o, string name)
    {
        var t = o[name];
        if (t is null || t.Type == JTokenType.Null || t.Type == JTokenType.Undefined)
        {
            o[name] = string.Empty;
        }
    }
}
