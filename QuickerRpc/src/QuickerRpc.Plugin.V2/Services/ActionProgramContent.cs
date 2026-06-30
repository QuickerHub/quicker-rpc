using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.V2.Services;

internal static class ActionProgramContent
{
    public const string EmptyBodyJson = "{\"steps\":[],\"variables\":[],\"subPrograms\":[]}";

    public static (JArray Steps, JArray Variables, JArray SubPrograms) ReadBodyArrays(JObject body) =>
        (
            (body["steps"] ?? body["Steps"]) as JArray ?? new JArray(),
            (body["variables"] ?? body["Variables"]) as JArray ?? new JArray(),
            (body["subPrograms"] ?? body["SubPrograms"]) as JArray ?? new JArray());

    public static bool IsXActionBody(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            var root = JObject.Parse(json);
            return (root["steps"] ?? root["Steps"]) is JArray
                || (root["variables"] ?? root["Variables"]) is JArray
                || (root["subPrograms"] ?? root["SubPrograms"]) is JArray;
        }
        catch
        {
            return false;
        }
    }
}
