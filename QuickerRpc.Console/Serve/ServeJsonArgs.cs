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

    /// <summary>
    /// Like <see cref="GetString"/> but preserves empty/whitespace values when the property is present.
    /// Returns null only when no matching property exists.
    /// </summary>
    public static string? GetStringAllowEmpty(JsonElement args, params string[] names)
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

            return ReadStringValue(prop) ?? string.Empty;
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

    public static bool? GetNullableBool(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return null;
        }

        return prop.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(prop.GetString(), out var b) => b,
            _ => null,
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

    /// <summary>Inline JSON from a string property or a serialized object/array.</summary>
    public static string? GetJsonInlineText(JsonElement args, params string[] names)
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

            var inline = ReadStringValue(prop);
            if (!string.IsNullOrWhiteSpace(inline))
            {
                return inline;
            }

            if (prop.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
            {
                return prop.GetRawText();
            }
        }

        return null;
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

    public static IDictionary<string, string>? GetStringDictionary(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var prop))
        {
            return null;
        }

        if (prop.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var item in prop.EnumerateObject())
        {
            var value = ReadStringValue(item.Value);
            if (!string.IsNullOrWhiteSpace(value))
            {
                result[item.Name] = value!;
            }
        }

        return result.Count > 0 ? result : null;
    }
}
