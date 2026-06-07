using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;

namespace QuickerRpc.AgentModel.Schemas;

/// <summary>Embedded qkrpc.program-data.v1 schema for data.json (shared steps; variables by programKind).</summary>
public static class ActionDataSchemaService
{
    public const string TopicId = "action-data-schema";
    public const string SchemaId = "qkrpc.program-data.v1";
    public const string ProgramKindAction = "action";
    public const string ProgramKindSubprogram = "subprogram";
    private const string ResourceName = "QuickerRpc.AgentModel.Schemas.action-data-schema.json";

    private static readonly Lazy<JsonObject> Cached = new Lazy<JsonObject>(Load);

    public static JsonObject GetSchema() => (JsonObject)Cached.Value.DeepClone();

    public static JsonObject GetDataTemplate(string programKind)
    {
        var kind = NormalizeProgramKind(programKind);
        var template = Cached.Value["template"] as JsonObject;
        if (template?[kind] is JsonObject row)
        {
            return (JsonObject)row.DeepClone();
        }

        return new JsonObject
        {
            ["variables"] = new JsonArray(),
            ["steps"] = new JsonArray(),
        };
    }

    public static string NormalizeProgramKind(string? programKind)
    {
        var kind = (programKind ?? ProgramKindAction).Trim();
        if (string.Equals(kind, ProgramKindSubprogram, StringComparison.OrdinalIgnoreCase))
        {
            return ProgramKindSubprogram;
        }

        return ProgramKindAction;
    }

    private static JsonObject Load()
    {
        var assembly = typeof(ActionDataSchemaService).Assembly;
        using var stream = assembly.GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            throw new InvalidOperationException("Missing embedded resource: " + ResourceName);
        }

        using var reader = new StreamReader(stream, Encoding.UTF8);
        var text = reader.ReadToEnd();
        var parsed = JsonNode.Parse(text) as JsonObject
            ?? throw new InvalidOperationException("Schema root must be a JSON object.");
        var schemaId = parsed["schemaId"]?.GetValue<string>();
        if (!string.Equals(schemaId, SchemaId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Unexpected schemaId in " + ResourceName + ": " + (schemaId ?? "(null)"));
        }

        return parsed;
    }
}
