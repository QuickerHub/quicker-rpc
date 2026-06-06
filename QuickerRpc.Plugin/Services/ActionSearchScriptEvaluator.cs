using System;
using System.Collections.Generic;
using System.Dynamic;
using Z.Expressions;

namespace QuickerRpc.Plugin.Services;

internal sealed class ActionSearchScriptEvaluator
{
    private readonly EvalContext _eval;

    public ActionSearchScriptEvaluator()
    {
        _eval = EvalManager.DefaultContext.Clone();
        _eval.UseLocalCache = true;
        _eval.RegisterType(typeof(ActionSearchScriptRow));
    }

    public bool TryEvaluateFilter(string script, ActionSearchScriptRow action, out bool matched, out string? error)
    {
        matched = false;
        error = null;
        if (string.IsNullOrWhiteSpace(script))
        {
            matched = true;
            return true;
        }

        try
        {
            var result = _eval.Execute(NormalizeScript(script), CreateScriptContext(action));
            if (result is bool flag)
            {
                matched = flag;
                return true;
            }

            error = "Filter script must return bool.";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public bool TryEvaluateSorter(string script, ActionSearchScriptRow action, out object? sortKey, out string? error)
    {
        sortKey = null;
        error = null;
        if (string.IsNullOrWhiteSpace(script))
        {
            return true;
        }

        try
        {
            sortKey = _eval.Execute(NormalizeScript(script), CreateScriptContext(action));
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    internal static int CompareSortKeys(object? left, object? right)
    {
        if (ReferenceEquals(left, right))
        {
            return 0;
        }

        if (left is null)
        {
            return -1;
        }

        if (right is null)
        {
            return 1;
        }

        if (left is IComparable comparable)
        {
            try
            {
                return comparable.CompareTo(right);
            }
            catch
            {
                // fall through to string compare
            }
        }

        return string.Compare(
            left.ToString(),
            right.ToString(),
            StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeScript(string script)
    {
        var text = script.Trim();
        if (text.StartsWith("$=", StringComparison.Ordinal))
        {
            return text.Substring(2).TrimStart();
        }

        return text;
    }

    private static dynamic CreateScriptContext(ActionSearchScriptRow action)
    {
        dynamic bag = new ExpandoObject();
        var dict = (IDictionary<string, object?>)bag;
        dict["action"] = action;
        return bag;
    }
}
