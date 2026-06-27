using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Google.Protobuf.WellKnownTypes;

namespace QuickerRpc.Console.Serve;

/// <summary>
/// Converts <see cref="Struct"/> to <see cref="JsonElement"/> by walking protobuf fields
/// (reliable when gRPC clients send Struct wire shape instead of plain JSON objects).
/// </summary>
internal static class ServeStructJson
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static JsonElement ToJsonElement(Struct? args)
    {
        if (args is null || args.Fields.Count == 0)
        {
            return JsonDocument.Parse("{}").RootElement;
        }

        var dict = StructToDictionary(args);
        return JsonSerializer.SerializeToElement(dict, JsonOptions);
    }

    private static Dictionary<string, object?> StructToDictionary(Struct s)
    {
        var dict = new Dictionary<string, object?>();
        foreach (var kv in s.Fields)
        {
            dict[kv.Key] = ValueToObject(kv.Value);
        }

        return dict;
    }

    private static object? ValueToObject(Value value) =>
        value.KindCase switch
        {
            Value.KindOneofCase.NullValue => null,
            Value.KindOneofCase.NumberValue => value.NumberValue,
            Value.KindOneofCase.StringValue => value.StringValue,
            Value.KindOneofCase.BoolValue => value.BoolValue,
            Value.KindOneofCase.StructValue => StructToDictionary(value.StructValue),
            Value.KindOneofCase.ListValue => value.ListValue.Values
                .Select(ValueToObject)
                .ToList(),
            _ => null,
        };
}
