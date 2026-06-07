using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Proto;

/// <summary>
/// Compact wire <c>inputParams</c> for workspace <c>data.json</c> and expand to canonical bind objects.
/// </summary>
public static class InputParamWireCoercer
{
    public const string FileKeySuffix = ".file";
    public const string VarKeySuffix = ".var";

    public enum WireBindKind
    {
        Value,
        File,
        Var,
    }

    /// <summary>Parse compact wire key: <c>expression.file</c> → (<c>expression</c>, file).</summary>
    public static (string BaseKey, WireBindKind Kind) ParseWireParamKey(string wireKey)
    {
        if (wireKey.EndsWith(FileKeySuffix, StringComparison.OrdinalIgnoreCase))
        {
            return (wireKey.Substring(0, wireKey.Length - FileKeySuffix.Length), WireBindKind.File);
        }

        if (wireKey.EndsWith(VarKeySuffix, StringComparison.OrdinalIgnoreCase))
        {
            return (wireKey.Substring(0, wireKey.Length - VarKeySuffix.Length), WireBindKind.Var);
        }

        return (wireKey, WireBindKind.Value);
    }

    /// <summary>
    /// Expand compact wire keys / scalar strings / legacy objects → canonical
    /// <c>{ value | varKey | file }</c> per param key.
    /// </summary>
    public static void ExpandInputParamsObject(JObject? inputParams)
    {
        if (inputParams is null)
        {
            return;
        }

        var merged = new Dictionary<string, JObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in inputParams.Properties().ToList())
        {
            var (baseKey, bindKind) = ParseWireParamKey(prop.Name);
            var paramObj = CoerceWireEntryToParamObject(prop.Value, bindKind);
            if (merged.TryGetValue(baseKey, out var existing))
            {
                MergeParamObjects(existing, paramObj);
            }
            else
            {
                merged[baseKey] = paramObj;
            }
        }

        inputParams.RemoveAll();
        foreach (var pair in merged)
        {
            inputParams[pair.Key] = pair.Value;
        }
    }

    /// <summary>
    /// Compact canonical bind objects to workspace wire keys (plain string values).
    /// </summary>
    public static void CompactInputParamsObject(JObject? inputParams)
    {
        if (inputParams is null)
        {
            return;
        }

        var compact = new JObject();
        foreach (var prop in inputParams.Properties().ToList())
        {
            if (prop.Value is not JObject paramObj)
            {
                continue;
            }

            var file = ReadNonEmptyString(paramObj["file"] ?? paramObj["File"]);
            var varKey = ReadNonEmptyString(paramObj["varKey"] ?? paramObj["VarKey"]);
            if (file is not null)
            {
                compact[prop.Name + FileKeySuffix] = NormalizeFileRef(file);
                continue;
            }

            if (varKey is not null)
            {
                compact[prop.Name + VarKeySuffix] = varKey;
                continue;
            }

            if (paramObj["value"] is JToken valueToken && valueToken.Type == JTokenType.String)
            {
                compact[prop.Name] = valueToken.Value<string>() ?? string.Empty;
            }
            else if (paramObj["Value"] is JToken pascalValue && pascalValue.Type == JTokenType.String)
            {
                compact[prop.Name] = pascalValue.Value<string>() ?? string.Empty;
            }
        }

        inputParams.RemoveAll();
        foreach (var prop in compact.Properties())
        {
            inputParams[prop.Name] = prop.Value;
        }
    }

    public static void ExpandStepsRecursive(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            ExpandInputParamsObject(step["inputParams"] as JObject);
            ExpandStepsRecursive(step["ifSteps"] as JArray);
            ExpandStepsRecursive(step["elseSteps"] as JArray);
        }
    }

    public static void CompactStepsRecursive(JArray? steps)
    {
        if (steps is null)
        {
            return;
        }

        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            CompactInputParamsObject(step["inputParams"] as JObject);
            CompactStepsRecursive(step["ifSteps"] as JArray);
            CompactStepsRecursive(step["elseSteps"] as JArray);
        }
    }

    /// <summary>Expand compact wire in patch steps before apply.</summary>
    public static void NormalizePatch(JObject patch)
    {
        if (patch["steps"] is JArray steps)
        {
            ExpandStepsRecursive(steps);
        }

        if (patch["step"] is JObject singleStep)
        {
            ExpandInputParamsObject(singleStep["inputParams"] as JObject);
        }

        if (patch["variables"] is JArray variables)
        {
            VariableDefaultValueWireCoercer.ExpandVariablesRecursive(variables);
        }
    }

    /// <summary>Legacy alias: expand wire → canonical.</summary>
    public static void NormalizeInputParamsObject(JObject? inputParams) =>
        ExpandInputParamsObject(inputParams);

    /// <summary>Legacy alias.</summary>
    public static void NormalizeStepsRecursive(JArray? steps) => ExpandStepsRecursive(steps);

    /// <summary>
    /// Coerce one scalar/object token to canonical param object (patch legacy paths).
    /// </summary>
    public static JObject CoerceToParamObject(JToken? token) =>
        CoerceWireEntryToParamObject(token, WireBindKind.Value);

    internal static bool TryParseTypedString(string text, out JObject result)
    {
        result = new JObject();
        if (text.StartsWith("@var:", StringComparison.OrdinalIgnoreCase))
        {
            var key = text.Substring(5).Trim();
            if (key.Length == 0)
            {
                return false;
            }

            result = new JObject { ["varKey"] = key };
            return true;
        }

        if (text.StartsWith("@file:", StringComparison.OrdinalIgnoreCase))
        {
            var path = NormalizeFileRef(text.Substring(6));
            if (path.Length == 0)
            {
                return false;
            }

            result = new JObject { ["file"] = path };
            return true;
        }

        if (text.StartsWith("@value:", StringComparison.OrdinalIgnoreCase))
        {
            result = new JObject { ["value"] = text.Substring(7) };
            return true;
        }

        return false;
    }

    private static JObject CoerceWireEntryToParamObject(JToken? token, WireBindKind bindKind)
    {
        if (token is null || token.Type == JTokenType.Null || token.Type == JTokenType.Undefined)
        {
            return new JObject();
        }

        if (token is JObject obj)
        {
            return NormalizeLegacyParamObject(obj);
        }

        if (token.Type != JTokenType.String)
        {
            return new JObject { ["value"] = token.ToString() };
        }

        var text = token.Value<string>() ?? string.Empty;
        switch (bindKind)
        {
            case WireBindKind.File:
                return new JObject { ["file"] = NormalizeFileRef(text) };
            case WireBindKind.Var:
                return new JObject { ["varKey"] = text.Trim() };
            default:
                if (TryParseTypedString(text, out var typed))
                {
                    return typed;
                }

                return new JObject { ["value"] = text };
        }
    }

    private static JObject NormalizeLegacyParamObject(JObject obj)
    {
        var result = (JObject)obj.DeepClone();
        CoerceNullStringField(result, "varKey");
        CoerceNullStringField(result, "VarKey");
        CoerceNullStringField(result, "value");
        CoerceNullStringField(result, "Value");
        CoerceNullStringField(result, "file");
        CoerceNullStringField(result, "File");
        return result;
    }

    private static void MergeParamObjects(JObject target, JObject patch)
    {
        foreach (var prop in patch.Properties())
        {
            target[prop.Name] = prop.Value?.DeepClone();
        }
    }

    private static void CoerceNullStringField(JObject o, string name)
    {
        var t = o[name];
        if (t is null || t.Type == JTokenType.Null || t.Type == JTokenType.Undefined)
        {
            o[name] = string.Empty;
        }
    }

    private static string? ReadNonEmptyString(JToken? token)
    {
        if (token is null || token.Type != JTokenType.String)
        {
            return null;
        }

        var text = token.Value<string>()?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static string NormalizeFileRef(string text) =>
        text.Trim().Replace('\\', '/');
}
