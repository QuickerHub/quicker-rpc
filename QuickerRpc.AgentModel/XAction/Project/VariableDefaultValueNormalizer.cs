using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Quicker initializes <see cref="VarTypeText"/> / <see cref="VarTypeAny"/> as <c>null</c> when
/// <c>defaultValue</c> is omitted. Agent workspace and save paths should emit <c>""</c> instead.
/// </summary>
public static class VariableDefaultValueNormalizer
{
    public const int VarTypeText = 0;
    public const int VarTypeAny = 99;

    public static void EnsureQuickerRuntimeDefaults(JArray variables)
    {
        foreach (var token in variables)
        {
            if (token is JObject variableObj)
            {
                EnsureQuickerRuntimeDefaults(variableObj);
            }
        }
    }

    public static void EnsureQuickerRuntimeDefaults(JObject variableObj)
    {
        if (!RequiresEmptyStringDefault(variableObj))
        {
            return;
        }

        if (VariableDefaultValueRef.TryGetFilePath(variableObj, out _)
            || HasLegacyDefaultValueFile(variableObj))
        {
            return;
        }

        if (!variableObj.ContainsKey("defaultValue")
            || variableObj["defaultValue"] is null
            || variableObj["defaultValue"]!.Type == JTokenType.Null)
        {
            variableObj["defaultValue"] = string.Empty;
        }
    }

    public static bool RequiresEmptyStringDefault(JObject variableObj)
    {
        var varType = ResolveVarType(variableObj);
        return varType is VarTypeText or VarTypeAny;
    }

    public static int ResolveVarType(JObject variableObj)
    {
        if (TryReadVarType(variableObj["varType"], out var fromVarType))
        {
            return fromVarType;
        }

        if (TryReadVarType(variableObj["type"], out var fromType))
        {
            return fromType;
        }

        return VarTypeText;
    }

    private static bool TryReadVarType(JToken? token, out int varType)
    {
        varType = VarTypeText;
        if (token is null || token.Type == JTokenType.Null)
        {
            return false;
        }

        switch (token.Type)
        {
            case JTokenType.Integer:
                varType = token.Value<int>();
                return true;
            case JTokenType.String:
                var raw = token.Value<string>()?.Trim() ?? string.Empty;
                if (int.TryParse(raw, out varType))
                {
                    return true;
                }

                return raw.ToLowerInvariant() switch
                {
                    "text" => Assign(VarTypeText, out varType),
                    "number" => Assign(1, out varType),
                    "boolean" => Assign(2, out varType),
                    "image" => Assign(3, out varType),
                    "list" => Assign(4, out varType),
                    "datetime" => Assign(6, out varType),
                    "enum" => Assign(9, out varType),
                    "dict" => Assign(10, out varType),
                    "integer" => Assign(12, out varType),
                    "table" => Assign(13, out varType),
                    "any" => Assign(VarTypeAny, out varType),
                    "object" => Assign(98, out varType),
                    _ => false,
                };
            default:
                return false;
        }
    }

    private static bool Assign(int value, out int varType)
    {
        varType = value;
        return true;
    }

    private static bool HasLegacyDefaultValueFile(JObject variableObj) =>
        variableObj[VariableDefaultValueRef.LegacyDefaultValueFileProperty]?.Type == JTokenType.String
        && !string.IsNullOrWhiteSpace(
            variableObj[VariableDefaultValueRef.LegacyDefaultValueFileProperty]!.Value<string>());
}
