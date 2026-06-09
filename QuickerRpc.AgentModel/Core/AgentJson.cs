using System.Text.Json;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.Core;

/// <summary>Bridge between <see cref="JsonElement"/> payloads and Newtonsoft <see cref="JToken"/> graphs.</summary>
public static class AgentJson
{
    public static JsonElement ToElement(JToken token)
    {
        var json = token.ToString();
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    public static JsonElement? ToElementOrNull(JToken? token) =>
        token is null ? null : ToElement(token);

    public static bool TryToJObject(JsonElement element, string paramName, out JObject? obj, out string? error)
    {
        obj = null;
        error = null;
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                obj = JObject.Parse(element.GetRawText());
                return true;
            case JsonValueKind.Undefined:
            case JsonValueKind.Null:
                error = $"{paramName} is required.";
                return false;
            default:
                error = $"{paramName} must be a JSON object.";
                return false;
        }
    }

    public static bool TryToJArray(JsonElement element, string paramName, out JArray? array, out string? error)
    {
        array = null;
        error = null;
        switch (element.ValueKind)
        {
            case JsonValueKind.Array:
                array = JArray.Parse(element.GetRawText());
                return true;
            case JsonValueKind.Undefined:
            case JsonValueKind.Null:
                error = $"{paramName} is required.";
                return false;
            default:
                error = $"{paramName} must be a JSON array.";
                return false;
        }
    }
}
