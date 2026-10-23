// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>
/// Omit native XAction envelope defaults from Agent CAW / program.source.yaml.
/// Missing keys round-trip via runtime defaults (<c>LimitSingleInstance=true</c>,
/// <c>SummaryExpression="$$"</c>, <c>PayloadType=xAction</c>).
/// </summary>
public static class ProgramEnvelopeDefaults
{
    public const string DefaultPayloadType = "xAction";
    public const string DefaultSummaryExpression = "$$";

    /// <summary>Strip default root / nested subprogram envelope fields in place.</summary>
    public static void OmitFrom(JObject data)
    {
        OmitOnObject(data, isProgramRoot: true);
        OmitInSubPrograms(data["subPrograms"] as JArray);
        OmitInSubPrograms(data["SubPrograms"] as JArray);
    }

    private static void OmitInSubPrograms(JArray? subPrograms)
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

            OmitOnObject(sub, isProgramRoot: false);
            OmitInSubPrograms(sub["subPrograms"] as JArray);
            OmitInSubPrograms(sub["SubPrograms"] as JArray);
        }
    }

    private static void OmitOnObject(JObject obj, bool isProgramRoot)
    {
        if (isProgramRoot)
        {
            OmitPayloadTypeIfDefault(obj, "PayloadType");
            OmitPayloadTypeIfDefault(obj, "payloadType");
            OmitBoolIfTrue(obj, "LimitSingleInstance");
            OmitBoolIfTrue(obj, "limitSingleInstance");
        }

        OmitSummaryExpressionIfDefault(obj, "SummaryExpression");
        OmitSummaryExpressionIfDefault(obj, "summaryExpression");
    }

    private static void OmitPayloadTypeIfDefault(JObject obj, string name)
    {
        var token = obj[name];
        if (token?.Type != JTokenType.String)
        {
            return;
        }

        if (string.Equals(token.Value<string>()?.Trim(), DefaultPayloadType, StringComparison.OrdinalIgnoreCase))
        {
            obj.Remove(name);
        }
    }

    private static void OmitBoolIfTrue(JObject obj, string name)
    {
        var token = obj[name];
        if (token is null)
        {
            return;
        }

        if (token.Type == JTokenType.Boolean && token.Value<bool>())
        {
            obj.Remove(name);
            return;
        }

        // Catalog / legacy may emit 1 / "true".
        if (token.Type == JTokenType.Integer && token.Value<long>() == 1)
        {
            obj.Remove(name);
            return;
        }

        if (token.Type == JTokenType.String
            && bool.TryParse(token.Value<string>(), out var parsed)
            && parsed)
        {
            obj.Remove(name);
        }
    }

    private static void OmitSummaryExpressionIfDefault(JObject obj, string name)
    {
        var token = obj[name];
        if (token is null)
        {
            return;
        }

        if (token.Type is JTokenType.Null or JTokenType.Undefined)
        {
            obj.Remove(name);
            return;
        }

        if (token.Type != JTokenType.String)
        {
            return;
        }

        var value = token.Value<string>();
        if (string.IsNullOrWhiteSpace(value)
            || string.Equals(value, DefaultSummaryExpression, StringComparison.Ordinal))
        {
            obj.Remove(name);
        }
    }
}
