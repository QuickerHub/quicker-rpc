using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Serializes agent step-runner get schema (compressed, no icon).</summary>
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
