using System;
using System.Collections.Generic;
using Z.Expressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Binds action variables to Z.Expressions as typed global variables (not dynamic bag members).
/// </summary>
internal static class ExpressionEvalBinding
{
    public static object? Execute(
        EvalContext eval,
        string preparedExpression,
        IReadOnlyDictionary<string, object?> globalsByPrefixedName,
        object? contextBinding = null,
        Action<string, object?>? onVariableWritten = null)
    {
        var registered = new List<string>(globalsByPrefixedName.Count + 1);
        try
        {
            foreach (var pair in globalsByPrefixedName)
            {
                eval.RegisterGlobalVariable(pair.Key, pair.Value ?? string.Empty);
                registered.Add(pair.Key);
            }

            if (contextBinding is not null)
            {
                eval.RegisterGlobalVariable("_context", contextBinding);
                registered.Add("_context");
            }

            var result = eval.Execute(preparedExpression);
            PublishGlobalWrites(eval, onVariableWritten);
            return result;
        }
        finally
        {
            if (registered.Count > 0)
            {
                eval.UnregisterGlobalVariable(registered.ToArray());
            }
        }
    }

    private static void PublishGlobalWrites(
        EvalContext eval,
        Action<string, object?>? onVariableWritten)
    {
        if (onVariableWritten is null)
        {
            return;
        }

        foreach (var pair in eval.AliasGlobalVariables)
        {
            if (!pair.Key.StartsWith("v_", StringComparison.Ordinal) || pair.Key.Length <= 2)
            {
                continue;
            }

            onVariableWritten(pair.Key.Substring(2), pair.Value);
        }
    }
}
