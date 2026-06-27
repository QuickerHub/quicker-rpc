using System;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.AgentModel.Schemas;

/// <summary>Embedded qkrpc.form-spec.v1 meta-schema for files/*.form.json (qkrpc.form.v1 documents).</summary>
public static class FormSpecSchemaService
{
    public const string TopicId = "form-spec";
    public const string SchemaId = "qkrpc.form-spec.v1";
    private const string ResourceName = "QuickerRpc.AgentModel.Schemas.form-spec-schema.json";

    private static readonly Lazy<JsonObject> Cached = new Lazy<JsonObject>(Load);

    public static JsonObject GetSchema() => (JsonObject)Cached.Value.DeepClone();

    public static JsonObject GetTemplate()
    {
        if (Cached.Value["template"] is JsonObject row)
        {
            return (JsonObject)row.DeepClone();
        }

        return new JsonObject
        {
            ["$schema"] = FormSpecDocument.SchemaId,
            ["mode"] = "variables",
            ["title"] = "Form title",
            ["fields"] = new JsonArray(),
        };
    }

    private static JsonObject Load()
    {
        var assembly = typeof(FormSpecSchemaService).Assembly;
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
