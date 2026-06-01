using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

internal static class ActionProgramContent
{
    public static (JArray Steps, JArray Variables, JArray SubPrograms) ReadBodyArrays(JObject body) =>
        (
            (body["steps"] ?? body["Steps"]) as JArray ?? new JArray(),
            (body["variables"] ?? body["Variables"]) as JArray ?? new JArray(),
            (body["subPrograms"] ?? body["SubPrograms"]) as JArray ?? new JArray());

    public static bool HasProgramContent(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            var root = JObject.Parse(json);
            var steps = (root["steps"] ?? root["Steps"]) as JArray;
            var variables = (root["variables"] ?? root["Variables"]) as JArray;
            var subPrograms = (root["subPrograms"] ?? root["SubPrograms"]) as JArray;
            return (steps?.Count ?? 0) > 0
                || (variables?.Count ?? 0) > 0
                || (subPrograms?.Count ?? 0) > 0;
        }
        catch
        {
            return false;
        }
    }
}
