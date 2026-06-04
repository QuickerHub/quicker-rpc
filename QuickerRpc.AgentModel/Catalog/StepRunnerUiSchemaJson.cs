using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Serializes step-runner schema for action-editor UI (icon, full control options).</summary>
public static class StepRunnerUiSchemaJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Serialize(StepRunnerAgentSchema schema) =>
        JsonSerializer.Serialize(schema, Options);
}
