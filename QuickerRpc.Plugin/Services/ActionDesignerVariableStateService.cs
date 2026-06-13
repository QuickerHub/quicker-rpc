using System;
using System.Windows;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X.BuiltinRunners.Misc;
using Quicker.Domain.Actions.X.Storage;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads persisted action variable state via <see cref="ActionStateWriter"/> ($var:key entries).
/// </summary>
internal static class ActionDesignerVariableStateService
{
    private const string VariableStateKeyPrefix = "$var:";

    public static bool TryReadVariableStates(Window designer, out string? json, out string? error)
    {
        json = null;
        error = null;

        var actionId = ActionDesignerContext.TryReadDesignerEntityId(designer);
        if (string.IsNullOrWhiteSpace(actionId))
        {
            error = "无法读取动作 ID。";
            return false;
        }

        if (!ActionDesignerReflection.TryGetDesignerVariables(designer, out var variables))
        {
            error = "无法读取设计器变量列表。";
            return false;
        }

        actionId = actionId.Trim();
        var root = new JObject
        {
            ["actionId"] = actionId,
            ["stateFileExists"] = ActionStateWriter.IsStateFileExists(actionId),
            ["variableCount"] = variables.Count,
        };

        var states = new JObject();
        foreach (var variable in variables)
        {
            var key = variable.Key?.Trim();
            if (string.IsNullOrEmpty(key))
            {
                continue;
            }

            var stateKey = VariableStateKeyPrefix + key;
            var (hasValue, storedText) = ActionStateWriter.ReadActionStateValue(actionId, stateKey);
            states[key] = new JObject
            {
                ["stateKey"] = stateKey,
                ["saveState"] = variable.SaveState,
                ["hasStoredValue"] = hasValue,
                ["value"] = hasValue ? TryParseStoredValue(storedText) : JValue.CreateNull(),
            };
        }

        root["variables"] = states;
        json = root.ToString(Formatting.Indented);
        return true;
    }

    private static JToken TryParseStoredValue(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var trimmed = value.Trim();
        if (trimmed.Length == 0)
        {
            return string.Empty;
        }

        if ((trimmed.StartsWith("{", StringComparison.Ordinal) && trimmed.EndsWith("}", StringComparison.Ordinal))
            || (trimmed.StartsWith("[", StringComparison.Ordinal) && trimmed.EndsWith("]", StringComparison.Ordinal)))
        {
            try
            {
                return JToken.Parse(trimmed);
            }
            catch (JsonException)
            {
            }
        }

        return value;
    }
}
