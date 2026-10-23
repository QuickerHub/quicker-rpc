using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>Keep native numeric lexemes that cannot roundtrip through a normal JValue.</summary>
public static class LosslessProgramJson
{
    private static readonly Regex NumberPattern = new(@"\A-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\z", RegexOptions.CultureInvariant);

    public static JObject ParseObject(string json, int maxDepth = 256)
    {
        try
        {
            using var document = JsonDocument.Parse(json, new JsonDocumentOptions
            {
                MaxDepth = maxDepth, CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true,
            });
            return Read(document.RootElement) as JObject ?? throw new JsonReaderException("Native program JSON must be an object.");
        }
        catch (System.Text.Json.JsonException ex)
        {
            throw new JsonReaderException("Invalid native program JSON: " + ex.Message, ex);
        }
    }

    public static bool TryParseNumber(string text, out JToken token)
    {
        token = null!;
        if (!NumberPattern.IsMatch(text)) return false;
        if (text.IndexOfAny(new[] { '.', 'e', 'E' }) < 0 && text != "-0")
        {
            if (long.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var integer)) token = new JValue(integer);
            else token = new JValue(BigInteger.Parse(text, CultureInfo.InvariantCulture));
            return true;
        }
        if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
            && !double.IsNaN(number) && !double.IsInfinity(number))
        {
            var scalar = new JValue(number);
            if (string.Equals(scalar.ToString(Formatting.None), text, StringComparison.Ordinal))
            {
                token = scalar;
                return true;
            }
        }
        token = new JRaw(text);
        return true;
    }

    public static string RequireNumberText(JToken token)
    {
        var text = (token as JRaw)?.Value as string;
        if (text is null || !NumberPattern.IsMatch(text)) throw new JsonReaderException("Only validated JSON numbers may be emitted as raw source scalars.");
        return text;
    }

    private static JToken Read(JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var result = new JObject();
                var keys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var property in value.EnumerateObject())
                {
                    if (!keys.Add(property.Name)) throw new JsonReaderException("Duplicate native JSON property: " + property.Name);
                    result.Add(property.Name, Read(property.Value));
                }
                return result;
            case JsonValueKind.Array:
                var items = new JArray();
                foreach (var item in value.EnumerateArray()) items.Add(Read(item));
                return items;
            case JsonValueKind.String: return new JValue(value.GetString());
            case JsonValueKind.Number:
                if (!TryParseNumber(value.GetRawText(), out var number)) throw new JsonReaderException("Invalid native JSON number.");
                return number;
            case JsonValueKind.True: return new JValue(true);
            case JsonValueKind.False: return new JValue(false);
            default: return JValue.CreateNull();
        }
    }
}
