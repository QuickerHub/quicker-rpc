using System;
using System.Linq;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X;
using Quicker.Public.Actions;
using Quicker.Utilities;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves action variables for <c>sys:evalexpression</c> placeholder binding.
/// </summary>
internal static class ExpressionVariableResolver
{
    public static object? Resolve(
        ActionExecuteContext context,
        XAction? action,
        string varKey,
        string expressionBody)
    {
        object? value = null;
        if (context.CustomData.TryGetValue(varKey, out var existing))
        {
            value = existing;
        }

        if (value is null && ShouldUseEmptyStringDefault(action, varKey))
        {
            value = string.Empty;
        }

        value = CoerceToExpressionValue(value);

        if (ShouldUseClipboardFallback(varKey, value, expressionBody))
        {
            value = ClipboardHelper.TryGetClipboardText();
        }

        return value;
    }

    internal static object? CoerceToExpressionValue(object? value)
    {
        if (value is null)
        {
            return null;
        }

        if (value is string)
        {
            return value;
        }

        if (value is char[] chars)
        {
            return new string(chars);
        }

        if (value is IFormattable or IConvertible)
        {
            try
            {
                return Convert.ToString(value);
            }
            catch
            {
                // fall through
            }
        }

        return value.ToString();
    }

    internal static bool ShouldUseClipboardFallback(string varKey, object? value, string expressionBody)
    {
        if (!string.Equals(varKey, "clipText", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (value is null)
        {
            return true;
        }

        var text = value as string ?? value.ToString() ?? string.Empty;
        if (text.Length == 0)
        {
            return true;
        }

        // Quicker debugger / polluted CustomData: param display leaked into clipText.
        if (text.Contains("[in]", StringComparison.Ordinal)
            || text.Contains("【值/表达式】", StringComparison.Ordinal)
            || text.Contains("{clipText}", StringComparison.Ordinal))
        {
            return true;
        }

        // clipText accidentally holds the expression source instead of clipboard text.
        if (!string.IsNullOrEmpty(expressionBody)
            && text.IndexOf("var lines", StringComparison.Ordinal) >= 0
            && expressionBody.IndexOf("var lines", StringComparison.Ordinal) >= 0)
        {
            return true;
        }

        return false;
    }

    private static bool ShouldUseEmptyStringDefault(XAction? action, string varKey)
    {
        var variable = action?.Variables?.FirstOrDefault(
            v => string.Equals(v.Key, varKey, StringComparison.Ordinal));
        if (variable is null)
        {
            return false;
        }

        return variable.Type is VarType.Text or VarType.Any;
    }
}
