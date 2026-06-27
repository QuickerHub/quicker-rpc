using Google.Protobuf;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.Api;

/// <summary>Serializes agent_api.proto messages to camelCase JSON (omit default values).</summary>
public static class AgentApiJson
{
    private static readonly JsonFormatter Formatter = new(
        new JsonFormatter.Settings(formatDefaultValues: true));

    public static string Format(SearchActionSummariesResult result) =>
        Formatter.Format(result);

    public static JObject ToJObject(SearchActionSummariesResult result) =>
        JObject.Parse(Format(result));
}
