using System;
using System.Collections.Generic;
#if QKHOST_V2
using System.Dynamic;
using HostEvalContext = Quicker.ExpressionEngine.QkEvalContext;
#else
using Z.Expressions;
using HostEvalContext = Z.Expressions.EvalContext;
#endif

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Binds action variables to the expression engine used by the active Quicker host.
/// </summary>
internal static class ExpressionEvalBinding
{
    public static object? Execute(
        HostEvalContext eval,
        string preparedExpression,
        IReadOnlyDictionary<string, object?> globalsByPrefixedName,
        object? contextBinding = null,
        Action<string, object?>? onVariableWritten = null)
    {
#if QKHOST_V2
        var variables = new WriteBackVariables(globalsByPrefixedName);
        if (contextBinding is not null)
        {
            variables.Set("_context", contextBinding);
        }

        var result = eval.ExecuteWithVariableWriteBackTransaction(preparedExpression, variables);
        PublishGlobalWrites(variables.Values, onVariableWritten);
        return result;
#else
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
#endif
    }

#if QKHOST_V2
    private sealed class WriteBackVariables : DynamicObject
    {
        private readonly Dictionary<string, object?> _values;

        public WriteBackVariables(IReadOnlyDictionary<string, object?> values)
        {
            _values = new Dictionary<string, object?>(values, StringComparer.Ordinal);
        }

        public IReadOnlyDictionary<string, object?> Values => _values;

        public void Set(string name, object? value) => _values[name] = value;

        public override bool TryGetMember(GetMemberBinder binder, out object? result) =>
            _values.TryGetValue(binder.Name, out result);

        public override bool TrySetMember(SetMemberBinder binder, object? value)
        {
            _values[binder.Name] = value;
            return true;
        }
    }

    private static void PublishGlobalWrites(
        IReadOnlyDictionary<string, object?> values,
        Action<string, object?>? onVariableWritten)
    {
        if (onVariableWritten is null)
        {
            return;
        }

        foreach (var pair in values)
        {
            if (!pair.Key.StartsWith("v_", StringComparison.Ordinal) || pair.Key.Length <= 2)
            {
                continue;
            }

            onVariableWritten(pair.Key.Substring(2), pair.Value);
        }
    }
#else
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
#endif
}
