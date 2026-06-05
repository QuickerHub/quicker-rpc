using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Workspace <c>variables[].defaultValue</c>: inline string or <c>{ "file": "files/…" }</c> (same idea as <c>inputParams</c>).
/// </summary>
public static class VariableDefaultValueRef
{
    /// <summary>Deprecated workspace field; read-only migration to <see cref="SetFileRef"/>.</summary>
    public const string LegacyDefaultValueFileProperty = "defaultValueFile";

    public static bool TryGetFilePath(JObject varObj, out string? relativePath)
    {
        relativePath = null;
        if (varObj["defaultValue"] is JObject fileObj)
        {
            var file = fileObj.Value<string>("file")?.Trim();
            if (!string.IsNullOrEmpty(file))
            {
                relativePath = file;
                return true;
            }
        }

        if (TryReadNonEmptyString(varObj[LegacyDefaultValueFileProperty], out relativePath))
        {
            return true;
        }

        relativePath = null;
        return false;
    }

    public static bool HasFileRef(JObject varObj) => TryGetFilePath(varObj, out _);

    public static void SetFileRef(JObject varObj, string relativePath)
    {
        varObj.Remove("default_value");
        varObj.Remove("DefaultValue");
        varObj.Remove(LegacyDefaultValueFileProperty);
        varObj["defaultValue"] = new JObject
        {
            ["file"] = XActionFileRefPath.NormalizeRelativePath(relativePath),
        };
    }

    public static bool TryGetInlineString(JObject varObj, out string? value)
    {
        value = null;
        var token = varObj["defaultValue"] ?? varObj["default_value"] ?? varObj["DefaultValue"];
        if (token is null || token.Type == JTokenType.Null)
        {
            return false;
        }

        if (token is JObject)
        {
            return false;
        }

        value = token.Type == JTokenType.String
            ? token.Value<string>()
            : token.ToString();
        value = value?.Trim();
        return !string.IsNullOrEmpty(value);
    }

    /// <summary>Moves legacy <c>defaultValueFile</c> to <c>defaultValue.file</c> when present.</summary>
    public static void MigrateLegacyFileProperty(JObject varObj)
    {
        if (!TryReadNonEmptyString(varObj[LegacyDefaultValueFileProperty], out var legacyPath))
        {
            return;
        }

        if (varObj["defaultValue"] is JObject existing
            && !string.IsNullOrWhiteSpace(existing.Value<string>("file")))
        {
            varObj.Remove(LegacyDefaultValueFileProperty);
            return;
        }

        SetFileRef(varObj, legacyPath!);
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
