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
        if (VarTypeCodec.TryParse(variableObj["varType"], out var fromVarType))
        {
            return fromVarType;
        }

        if (VarTypeCodec.TryParse(variableObj["type"], out var fromType))
        {
            return fromType;
        }

        return VarTypeText;
    }

    private static bool HasLegacyDefaultValueFile(JObject variableObj) =>
        variableObj[VariableDefaultValueRef.LegacyDefaultValueFileProperty]?.Type == JTokenType.String
        && !string.IsNullOrWhiteSpace(
            variableObj[VariableDefaultValueRef.LegacyDefaultValueFileProperty]!.Value<string>());
}
