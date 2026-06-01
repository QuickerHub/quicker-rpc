using Google.Protobuf;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>Serializes agent compressed protobuf messages to camelCase JSON (omit default values).</summary>
public static class AgentCompressedProgramJson
{
    private static readonly JsonFormatter Formatter = new(
        new JsonFormatter.Settings(formatDefaultValues: false));

    public static JObject ToJObject(AgentCompressedProgram program) =>
        JObject.Parse(Formatter.Format(program));

    public static JObject ToJObject(AgentCompressedStep step) =>
        JObject.Parse(Formatter.Format(step));

    public static JObject ToJObject(AgentCompressedVariable variable) =>
        JObject.Parse(Formatter.Format(variable));
}
