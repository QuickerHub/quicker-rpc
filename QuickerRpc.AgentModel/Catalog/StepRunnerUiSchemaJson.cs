using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Serializes step-runner schema for action-editor UI (icon, full control options).</summary>
public static class StepRunnerUiSchemaJson
{
    private static readonly JsonSerializerSettings Settings = new()
    {
        Formatting = Formatting.None,
        NullValueHandling = NullValueHandling.Ignore,
        DefaultValueHandling = DefaultValueHandling.Ignore,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };

    public static string Serialize(StepRunnerAgentSchema schema) =>
        JsonConvert.SerializeObject(schema, Settings);
}
