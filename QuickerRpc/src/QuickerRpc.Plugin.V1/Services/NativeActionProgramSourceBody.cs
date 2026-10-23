using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

/// <summary>Replaces editable program arrays while retaining catalog-owned root fields.</summary>
internal static class NativeActionProgramSourceBody
{
    public static JObject Parse(string json)
    {
        // Program parameters are strings even when they look like ISO timestamps.
        using var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None, MaxDepth = 256 };
        var body = JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
        while (reader.Read())
        {
            if (reader.TokenType != JsonToken.Comment)
            {
                throw new JsonReaderException("Additional content after the native program JSON.");
            }
        }

        return body;
    }

    public static string Merge(JObject catalogBody, JObject submittedBody)
    {
        RejectDuplicateProperties(catalogBody);
        RejectDuplicateProperties(submittedBody);
        var result = (JObject)catalogBody.DeepClone();
        foreach (var property in submittedBody.Properties())
        {
            if (IsProgramArray(property.Name))
            {
                if (property.Value is not JArray)
                {
                    throw new JsonException(property.Name + " must be an array.");
                }

                var existing = FindProperty(result, property.Name);
                result[existing?.Name ?? CanonicalArrayName(property.Name)] = property.Value.DeepClone();
                continue;
            }

            var catalogProperty = FindProperty(catalogBody, property.Name);
            if (catalogProperty is null || !JToken.DeepEquals(catalogProperty.Value, property.Value))
            {
                throw new InvalidOperationException("Root field '" + property.Name + "' is read-only in action program source editing.");
            }
        }

        if (FindProperty(submittedBody, "steps")?.Value is not JArray
            || FindProperty(submittedBody, "variables")?.Value is not JArray)
        {
            throw new JsonException("Native program JSON requires steps and variables arrays.");
        }

        if (FindProperty(result, "subPrograms") is null)
        {
            result["subPrograms"] = new JArray();
        }

        return result.ToString(Formatting.None);
    }

    private static JProperty? FindProperty(JObject body, string name) =>
        body.Properties().FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));

    private static bool IsProgramArray(string name) =>
        string.Equals(name, "steps", StringComparison.OrdinalIgnoreCase)
        || string.Equals(name, "variables", StringComparison.OrdinalIgnoreCase)
        || string.Equals(name, "subPrograms", StringComparison.OrdinalIgnoreCase);

    private static string CanonicalArrayName(string name) =>
        string.Equals(name, "steps", StringComparison.OrdinalIgnoreCase) ? "steps"
        : string.Equals(name, "variables", StringComparison.OrdinalIgnoreCase) ? "variables"
        : "subPrograms";

    private static void RejectDuplicateProperties(JObject body)
    {
        var duplicate = body.Properties().GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
        {
            throw new JsonException("Ambiguous native program root field: " + duplicate.Key);
        }
    }
}
