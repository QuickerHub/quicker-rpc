using System;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Normalizes step-runner catalog defaults for agent <c>step-runner get</c> schema.
/// Step <c>inputParams</c> may use the same JSON types or strings (<c>$=</c>/<c>$$</c> must be string).
/// </summary>
public static class StepRunnerAgentDefaultValue
{
    /// <summary>Quicker VarType.Boolean</summary>
    public const int BooleanVarType = 2;

    /// <summary>
    /// Boolean params emit JSON <c>true</c>/<c>false</c> in get output (aligned with optional typed wire literals).
    /// </summary>
    public static object? FormatForAgent(int varType, string? rawDefault)
    {
        var raw = (rawDefault ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return null;
        }

        if (varType == BooleanVarType && TryParseBoolLiteral(raw, out var boolean))
        {
            return boolean;
        }

        return raw;
    }

    /// <summary>Normalize catalog <see cref="StepRunnerInputParamDef.DefaultValue"/> after reading Quicker metadata.</summary>
    public static string NormalizeCatalogDefault(int varType, string serialized)
    {
        var raw = (serialized ?? string.Empty).Trim();
        if (raw.Length == 0)
        {
            return string.Empty;
        }

        if (varType == BooleanVarType && TryParseBoolLiteral(raw, out var boolean))
        {
            return boolean ? "true" : "false";
        }

        return raw;
    }

    public static bool TryParseBoolLiteral(string raw, out bool value)
    {
        switch (raw.Trim().ToLowerInvariant())
        {
            case "1":
            case "true":
            case "yes":
                value = true;
                return true;
            case "0":
            case "false":
            case "no":
                value = false;
                return true;
            default:
                value = false;
                return false;
        }
    }
}
