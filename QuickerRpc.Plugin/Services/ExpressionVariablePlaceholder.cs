using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Rewrites <c>{varKey}</c> placeholders in <c>sys:evalexpression</c> bodies.
/// Only keys declared on the action (plus built-in <c>quicker_in_param</c>) are replaced
/// so regex tokens like <c>\p{L}</c> are left intact.
/// </summary>
internal static class ExpressionVariablePlaceholder
{
    public const string QuickerInParamKey = "quicker_in_param";

    private static readonly Regex Pattern = new(
        @"\{([a-zA-Z_][a-zA-Z0-9_]*)\}",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static HashSet<string> BuildDefinedKeys(XAction? action)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal)
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
        Func<string, bool> shouldReplace,
        Func<string, object?> resolveValue,
        Action<string, object?> bindVariable)
    {
        var processedVars = new HashSet<string>(StringComparer.Ordinal);
        return Pattern.Replace(expression, match =>
        {
            var varKey = match.Groups[1].Value;
            if (!shouldReplace(varKey))
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
