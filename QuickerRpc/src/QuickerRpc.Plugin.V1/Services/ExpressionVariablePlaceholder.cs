using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Rewrites <c>{varKey}</c> placeholders in <c>sys:evalexpression</c> bodies.
/// Mirrors <c>EvalExpressionStepV2.ReplaceVariableTokens</c> in QuickerPc:
/// only declared keys are replaced; small key sets use per-key scan, large sets use regex single-pass.
/// </summary>
internal static class ExpressionVariablePlaceholder
{
    public const string QuickerInParamKey = "quicker_in_param";

    /// <summary>Below this count, foreach defined keys; above, regex single-pass.</summary>
    private const int RegexReplaceDefinedVarThreshold = 128;

    private static readonly Regex VarPattern = new(
        @"\{([^}{\s]+)\}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static HashSet<string> BuildDefinedKeys(XAction? action)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            QuickerInParamKey,
        };

        if (action?.Variables is null)
        {
            return keys;
        }

        foreach (var variable in action.Variables)
        {
            if (!string.IsNullOrEmpty(variable.Key))
            {
                keys.Add(variable.Key);
            }
        }

        return keys;
    }

    public static string Replace(
        string expression,
        HashSet<string> definedKeys,
        Func<string, object?> resolveValue,
        Action<string, object?> bindVariable)
    {
        if (definedKeys.Count == 0 || expression.IndexOf('{') < 0)
        {
            return expression;
        }

        if (UseDefinedKeysFastPath(definedKeys.Count, expression))
        {
            return ReplaceDefinedKeysOnly(expression, definedKeys, resolveValue, bindVariable);
        }

        return ReplaceVariableTokensByRegex(expression, definedKeys, resolveValue, bindVariable);
    }

    internal static bool UseDefinedKeysFastPath(int definedCount, string expression)
    {
        if (definedCount == 0 || definedCount > RegexReplaceDefinedVarThreshold)
        {
            return false;
        }

        if (definedCount <= 16)
        {
            return true;
        }

        if (definedCount <= 64)
        {
            return VarPattern.Matches(expression).Count > definedCount * 8;
        }

        return false;
    }

    private static string ReplaceDefinedKeysOnly(
        string expression,
        HashSet<string> definedKeys,
        Func<string, object?> resolveValue,
        Action<string, object?> bindVariable)
    {
        foreach (var varKey in definedKeys)
        {
            var token = "{" + varKey + "}";
            if (expression.IndexOf(token, StringComparison.Ordinal) < 0)
            {
                continue;
            }

            var varName = "v_" + varKey;
            bindVariable(varName, resolveValue(varKey));
            expression = expression.Replace(token, varName);
        }

        return expression;
    }

    private static string ReplaceVariableTokensByRegex(
        string expression,
        HashSet<string> definedKeys,
        Func<string, object?> resolveValue,
        Action<string, object?> bindVariable)
    {
        var processedVars = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        return VarPattern.Replace(expression, match =>
        {
            var varKey = match.Groups[1].Value;
            if (!definedKeys.Contains(varKey))
            {
                return match.Value;
            }

            var varName = "v_" + varKey;
            if (processedVars.Contains(varKey))
            {
                return varName;
            }

            processedVars.Add(varKey);
            bindVariable(varName, resolveValue(varKey));
            return varName;
        });
    }
}
