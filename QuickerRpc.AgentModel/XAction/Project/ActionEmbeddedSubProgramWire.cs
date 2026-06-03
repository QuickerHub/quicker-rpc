using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Agent wire JSON for action-embedded subprograms (recursive compress/decompress helpers).</summary>
public static class ActionEmbeddedSubProgramWire
{
    public static JArray CompressFromNative(
        JArray nativeSubPrograms,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var result = new JArray();
        foreach (var token in nativeSubPrograms)
        {
            if (token is not JObject subProgram)
            {
                continue;
            }

            result.Add(CompressOne(subProgram, catalog, omitDefaultLiteralInputs));
        }

        return result;
    }

    private static JObject CompressOne(
        JObject nativeSubProgram,
        StepRunnerCatalog catalog,
        bool omitDefaultLiteralInputs)
    {
        var steps = nativeSubProgram["steps"] as JArray ?? nativeSubProgram["Steps"] as JArray ?? new JArray();
        var variables = nativeSubProgram["variables"] as JArray
            ?? nativeSubProgram["Variables"] as JArray
            ?? new JArray();
        XActionCompressor.NormalizeQuickerWireNames(steps, variables);
        var compressedBody = XActionCompressor.Compress(steps, variables, catalog, omitDefaultLiteralInputs);

        var output = new JObject
        {
            ["id"] = ReadString(nativeSubProgram, "id", "Id") ?? string.Empty,
            ["name"] = ReadString(nativeSubProgram, "name", "Name") ?? string.Empty,
            ["description"] = ReadString(nativeSubProgram, "description", "Description") ?? string.Empty,
            ["icon"] = ReadString(nativeSubProgram, "icon", "Icon") ?? string.Empty,
            ["steps"] = compressedBody["steps"] ?? new JArray(),
            ["variables"] = compressedBody["variables"] ?? new JArray(),
        };

        CopyOptionalString(nativeSubProgram, output, "summaryExpression", "SummaryExpression");
        CopyOptionalBool(nativeSubProgram, output, "isLocalEdited", "IsLocalEdited");
        CopyOptionalBool(nativeSubProgram, output, "isProtected", "IsProtected");
        CopyOptionalString(nativeSubProgram, output, "templateId", "TemplateId");
        CopyOptionalInt(nativeSubProgram, output, "templateRevision", "TemplateRevision");
        CopyOptionalBool(nativeSubProgram, output, "useServerVersion", "UseServerVersion");
        CopyOptionalString(nativeSubProgram, output, "sharedId", "SharedId");

        var nested = nativeSubProgram["subPrograms"] as JArray ?? nativeSubProgram["SubPrograms"] as JArray;
        output["subPrograms"] = nested is { Count: > 0 }
            ? CompressFromNative(nested, catalog, omitDefaultLiteralInputs)
            : new JArray();

        output["stepCount"] = CountStepsRecursive(output["steps"] as JArray ?? new JArray());
        output["variableCount"] = (output["variables"] as JArray)?.Count ?? 0;
        return output;
    }

    private static int CountStepsRecursive(JArray steps)
    {
        var count = steps.Count;
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                count += CountStepsRecursive(ifSteps);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                count += CountStepsRecursive(elseSteps);
            }
        }

        return count;
    }

    private static string? ReadString(JObject obj, string camel, string pascal)
    {
        var value = obj[camel]?.Type == JTokenType.String
            ? obj.Value<string>(camel)
            : obj.Value<string>(pascal);
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static void CopyOptionalString(JObject source, JObject target, string camel, string pascal)
    {
        var value = ReadString(source, camel, pascal);
        if (value is not null)
        {
            target[camel] = value;
        }
    }

    private static void CopyOptionalBool(JObject source, JObject target, string camel, string pascal)
    {
        var token = source[camel] ?? source[pascal];
        if (token?.Type == JTokenType.Boolean)
        {
            target[camel] = token.Value<bool>();
        }
    }

    private static void CopyOptionalInt(JObject source, JObject target, string camel, string pascal)
    {
        var token = source[camel] ?? source[pascal];
        if (token?.Type == JTokenType.Integer)
        {
            target[camel] = token.Value<int>();
        }
    }
}
