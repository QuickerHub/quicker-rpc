using System;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Detects qkrpc.form.v1 document shape on a JSON object.</summary>
public static class FormSpecDocumentShape
{
    public static bool IsInlineDocument(JObject obj)
    {
        if (obj["fields"] is not JArray)
        {
            return false;
        }

        return obj["mode"] is not null || obj["$schema"] is not null;
    }

    public static bool LooksLikeFormSpecText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        try
        {
            var token = JToken.Parse(text);
            return token is JObject obj && IsInlineDocument(obj);
        }
        catch
        {
            return false;
        }
    }

    public static bool LooksLikeFormSpecFile(string? relativePath) =>
        !string.IsNullOrWhiteSpace(relativePath)
        && relativePath.Trim().EndsWith(".form.json", StringComparison.OrdinalIgnoreCase);
}
