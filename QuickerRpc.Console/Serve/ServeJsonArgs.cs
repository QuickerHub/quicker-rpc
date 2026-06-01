using System.Text.Json;

namespace QuickerRpc.Console.Serve;

internal static class ServeJsonArgs
{
    public static string? GetString(JsonElement args, params string[] names)
    {
        if (args.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var name in names)
        {
            if (!args.TryGetProperty(name, out var prop))
            {
                continue;
            }

            var parsed = ReadStringValue(prop);
            if (!string.IsNullOrWhiteSpace(parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static string? ReadStringValue(JsonElement prop) =>
        prop.ValueKind switch
        {
            JsonValueKind.String => prop.GetString(),
            JsonValueKind.Number => prop.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };

    public static int? GetInt(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return null;
        }

        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt32(out var n))
        {
            return n;
        }

        if (prop.ValueKind == JsonValueKind.String && int.TryParse(prop.GetString(), out n))
        {
            return n;
        }

        return null;
    }

    public static long? GetLong(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return null;
        }

        if (prop.ValueKind == JsonValueKind.Number && prop.TryGetInt64(out var n))
        {
            return n;
        }

        if (prop.ValueKind == JsonValueKind.String && long.TryParse(prop.GetString(), out n))
        {
            return n;
        }

        return null;
    }

    public static bool GetBool(JsonElement args, string name, bool defaultValue = false)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return defaultValue;
        }

        return prop.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String => bool.TryParse(prop.GetString(), out var b) && b,
            _ => defaultValue,
        };
    }

    public static JsonElement? GetObject(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return null;
        }

        return prop.ValueKind is JsonValueKind.Object or JsonValueKind.Array ? prop : null;
    }

    public static IList<string> GetStringList(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return Array.Empty<string>();
        }

        if (prop.ValueKind == JsonValueKind.Array)
        {
            return prop.EnumerateArray()
                .Select(e => e.GetString())
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s!)
                .ToList();
        }

        if (prop.ValueKind == JsonValueKind.String)
        {
            var single = prop.GetString();
            return string.IsNullOrWhiteSpace(single) ? Array.Empty<string>() : new[] { single };
        }

        return Array.Empty<string>();
    }
}
