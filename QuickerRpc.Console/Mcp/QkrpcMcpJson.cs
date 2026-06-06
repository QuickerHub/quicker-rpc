using System.Text.Json;
using System.Text.Json.Serialization;
using QuickerRpc.Console.Serve;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpJson
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string FormatServeResponse(ServeInvokeResponse response) =>
        JsonSerializer.Serialize(response, SerializerOptions);

    public static string FormatObject(object value) =>
        JsonSerializer.Serialize(value, SerializerOptions);

    public static JsonElement ParseArgsObject(string? argsJson)
    {
        if (string.IsNullOrWhiteSpace(argsJson))
        {
            return EmptyObject();
        }

        try
        {
            using var doc = JsonDocument.Parse(argsJson);
            return doc.RootElement.ValueKind switch
            {
                JsonValueKind.Object => doc.RootElement.Clone(),
                _ => throw new JsonException("argsJson must be a JSON object."),
            };
        }
        catch (JsonException ex)
        {
            return ErrorObject(ex.Message);
        }
    }

    public static JsonElement ParsePatchObject(string? patchJson)
    {
        if (string.IsNullOrWhiteSpace(patchJson))
        {
            return default;
        }

        using var doc = JsonDocument.Parse(patchJson);
        return doc.RootElement.Clone();
    }

    public static JsonElement ToElement(object value)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, SerializerOptions);
        using var doc = JsonDocument.Parse(bytes);
        return doc.RootElement.Clone();
    }

    private static JsonElement EmptyObject()
    {
        using var doc = JsonDocument.Parse("{}");
        return doc.RootElement.Clone();
    }

    private static JsonElement ErrorObject(string message)
    {
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(new { parseError = message }));
        return doc.RootElement.Clone();
    }
}
