using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Serializes step-runner get schema as compact camelCase JSON for agents.</summary>
public static class StepRunnerAgentSchemaJson
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Serialize(StepRunnerAgentSchema schema)
    {
        var compressed = StepRunnerAgentSchemaCompressor.Compress(schema);
        return JsonSerializer.Serialize(compressed, Options);
    }
}
