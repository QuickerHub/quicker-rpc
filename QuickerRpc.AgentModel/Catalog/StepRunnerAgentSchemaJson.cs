using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Serializes agent step-runner get schema (compressed, no icon).</summary>
public static class StepRunnerAgentSchemaJson
{
    private static readonly JsonSerializerSettings Settings = new()
    {
        Formatting = Formatting.None,
        NullValueHandling = NullValueHandling.Ignore,
        DefaultValueHandling = DefaultValueHandling.Ignore,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };

    public static string Serialize(StepRunnerAgentSchema schema)
    {
        var compressed = StepRunnerAgentSchemaCompressor.Compress(schema);
        return JsonConvert.SerializeObject(compressed, Settings);
    }
}
