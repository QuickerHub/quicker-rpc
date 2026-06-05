using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static class SettingsChangesParser
{
    public static (bool Ok, IList<QuickerRpcSettingChangeItem> Changes, string? ErrorCode, string? ErrorMessage)
        ParseJson(string jsonText)
    {
        try
        {
            using var doc = JsonDocument.Parse(jsonText);
            var root = doc.RootElement;
            var changes = root.ValueKind switch
            {
                JsonValueKind.Array => ParseArray(root),
                JsonValueKind.Object => ParseObject(root),
                _ => null,
            };

            if (changes is null || changes.Count == 0)
            {
                return (false, Array.Empty<QuickerRpcSettingChangeItem>(), "INVALID_CHANGES",
                    "JSON must be a non-empty array [{key,value}] or object {\"scope:path\": \"value\"}.");
            }

            return (true, changes, null, null);
        }
        catch (JsonException ex)
        {
            return (false, Array.Empty<QuickerRpcSettingChangeItem>(), "INVALID_JSON", ex.Message);
        }
    }

    public static IList<QuickerRpcSettingChangeItem>? ParseFromServeArgs(JsonElement args, out string? error)
    {
        error = null;
        if (args.ValueKind != JsonValueKind.Object)
        {
            error = "args must be an object.";
            return null;
        }

        if (args.TryGetProperty("changes", out var changesEl))
        {
            if (changesEl.ValueKind == JsonValueKind.Array)
            {
                var parsed = ParseArray(changesEl);
                if (parsed.Count == 0)
                {
                    error = "args.changes must be a non-empty array.";
                    return null;
                }

                return parsed;
            }

            error = "args.changes must be an array.";
            return null;
        }

        if (args.TryGetProperty("patch", out var patchEl) && patchEl.ValueKind == JsonValueKind.Object)
        {
            var parsed = ParseObject(patchEl);
            if (parsed.Count == 0)
            {
                error = "args.patch must be a non-empty object.";
                return null;
            }

            return parsed;
        }

        error = "args.changes (array) or args.patch (object) is required.";
        return null;
    }

    private static List<QuickerRpcSettingChangeItem> ParseArray(JsonElement array)
    {
        var changes = new List<QuickerRpcSettingChangeItem>();
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var key = ReadStringProperty(item, "key");
            var value = ReadStringProperty(item, "value");
            if (string.IsNullOrWhiteSpace(key) || value is null)
            {
                continue;
            }

            changes.Add(new QuickerRpcSettingChangeItem { Key = key.Trim(), Value = value });
        }

        return changes;
    }

    private static List<QuickerRpcSettingChangeItem> ParseObject(JsonElement obj)
    {
        var changes = new List<QuickerRpcSettingChangeItem>();
        foreach (var property in obj.EnumerateObject())
        {
            var key = property.Name.Trim();
            if (key.Length == 0)
            {
                continue;
            }

            var value = ReadJsonValue(property.Value);
            if (value is null)
            {
                continue;
            }

            changes.Add(new QuickerRpcSettingChangeItem { Key = key, Value = value });
        }

        return changes;
    }

    private static string? ReadStringProperty(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var prop))
        {
            return null;
        }

        return ReadJsonValue(prop);
    }

    private static string? ReadJsonValue(JsonElement prop) =>
        prop.ValueKind switch
        {
            JsonValueKind.String => prop.GetString(),
            JsonValueKind.Number => prop.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null,
        };
}
