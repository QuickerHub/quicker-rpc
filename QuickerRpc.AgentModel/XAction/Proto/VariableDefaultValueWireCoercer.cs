using System;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Compact workspace wire for variables: <c>default</c> (inline) or <c>default.file</c> on data.json.
/// Expands to canonical <c>defaultValue</c> (string or file object) for runtime/patch.
/// </summary>
public static class VariableDefaultValueWireCoercer
{
    public const string DefaultValueField = "defaultValue";
    /// <summary>Legacy disk wire key; read-only on expand.</summary>
    public const string DefaultValueFileWireKey = "defaultValue.file";
    public const string DefaultWireField = "default";
    public const string DefaultFileWireKey = "default.file";

    public static void ExpandVariablesRecursive(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is JObject varObj)
            {
                ExpandVariableObject(varObj);
            }
        }
    }

    public static void CompactVariablesRecursive(JArray? variables)
    {
        if (variables is null)
        {
            return;
        }

        foreach (var token in variables)
        {
            if (token is JObject varObj)
            {
                CompactVariableObject(varObj);
            }
        }
    }

    /// <summary>Expand wire keys / legacy shapes to canonical defaultValue (string or file object).</summary>
    public static void ExpandVariableObject(JObject varObj)
    {
        VariableDefaultValueRef.MigrateLegacyFileProperty(varObj);

        var filePath = ReadWireFilePath(varObj);
        if (!string.IsNullOrEmpty(filePath))
        {
            VariableDefaultValueRef.SetFileRef(varObj, filePath!);
            RemoveIncomingWireKeys(varObj);
            return;
        }

        var inline = ReadWireInline(varObj);
        if (inline is not null)
        {
            varObj[DefaultValueField] = inline;
        }

        RemoveIncomingWireKeys(varObj);

        if (varObj[DefaultValueField] is JObject fileObj
            && !string.IsNullOrWhiteSpace(fileObj.Value<string>("file")))
        {
            return;
        }

        if (varObj[DefaultValueField] is JObject legacyObj)
        {
            var legacyFile = legacyObj.Value<string>("file")?.Trim();
            if (!string.IsNullOrEmpty(legacyFile))
            {
                VariableDefaultValueRef.SetFileRef(varObj, legacyFile);
            }
        }
    }

    /// <summary>Compact canonical defaultValue to <c>default</c> / <c>default.file</c> wire keys for data.json.</summary>
    public static void CompactVariableObject(JObject varObj)
    {
        VariableDefaultValueRef.MigrateLegacyFileProperty(varObj);

        if (TryResolveFilePath(varObj, out var filePath))
        {
            varObj[DefaultFileWireKey] = filePath!.Replace('\\', '/');
            RemoveLegacyCanonicalKeys(varObj);
            varObj.Remove(DefaultWireField);
            return;
        }

        if (TryResolveInline(varObj, out var inline))
        {
            varObj[DefaultWireField] = inline;
            RemoveLegacyCanonicalKeys(varObj);
            varObj.Remove(DefaultFileWireKey);
            return;
        }

        if (varObj[DefaultValueField] is JObject)
        {
            RemoveLegacyCanonicalKeys(varObj);
        }

        RemoveStaleWireKeys(varObj);
        varObj.Remove(VariableDefaultValueRef.LegacyDefaultValueFileProperty);
    }

    private static bool TryResolveFilePath(JObject varObj, out string? filePath)
    {
        if (VariableDefaultValueRef.TryGetFilePath(varObj, out filePath)
            && !string.IsNullOrEmpty(filePath))
        {
            return true;
        }

        if (TryReadPathToken(varObj[DefaultFileWireKey], out filePath)
            || TryReadPathToken(varObj[DefaultValueFileWireKey], out filePath))
        {
            return true;
        }

        filePath = null;
        return false;
    }

    private static bool TryResolveInline(JObject varObj, out string? inline)
    {
        var token = varObj[DefaultValueField] ?? varObj["default_value"] ?? varObj["DefaultValue"];
        if (token is not null && token.Type != JTokenType.Null && token is not JObject)
        {
            inline = token.Type == JTokenType.String
                ? token.Value<string>() ?? string.Empty
                : token.ToString();
            return true;
        }

        return TryReadInlineToken(varObj[DefaultWireField], out inline)
               || TryReadInlineToken(varObj[DefaultValueField], out inline);
    }

    private static void RemoveLegacyCanonicalKeys(JObject varObj)
    {
        varObj.Remove(DefaultValueField);
        varObj.Remove("default_value");
        varObj.Remove("DefaultValue");
        varObj.Remove(DefaultValueFileWireKey);
        varObj.Remove(VariableDefaultValueRef.LegacyDefaultValueFileProperty);
    }

    private static void RemoveStaleWireKeys(JObject varObj)
    {
        varObj.Remove(DefaultValueFileWireKey);
        varObj.Remove(DefaultFileWireKey);
        varObj.Remove(DefaultWireField);
    }

    private static string? ReadWireFilePath(JObject varObj)
    {
        if (TryReadPathToken(varObj[DefaultValueFileWireKey], out var path)
            || TryReadPathToken(varObj[DefaultFileWireKey], out path))
        {
            return path;
        }

        return null;
    }

    private static string? ReadWireInline(JObject varObj)
    {
        if (TryReadInlineToken(varObj[DefaultWireField], out var inline)
            || TryReadInlineToken(varObj[DefaultValueField], out inline))
        {
            return inline;
        }

        return null;
    }

    private static bool TryReadPathToken(JToken? token, out string? path)
    {
        path = null;
        if (token is null || token.Type != JTokenType.String)
        {
            return false;
        }

        path = token.Value<string>()?.Trim().Replace('\\', '/');
        return !string.IsNullOrEmpty(path);
    }

    private static bool TryReadInlineToken(JToken? token, out string? value)
    {
        value = null;
        if (token is null || token.Type == JTokenType.Null)
        {
            return false;
        }

        if (token is JObject)
        {
            return false;
        }

        value = token.Type == JTokenType.String ? token.Value<string>() : token.ToString();
        return true;
    }

    private static void RemoveIncomingWireKeys(JObject varObj)
    {
        varObj.Remove(DefaultValueFileWireKey);
        varObj.Remove(DefaultFileWireKey);
        varObj.Remove(DefaultWireField);
    }
}
