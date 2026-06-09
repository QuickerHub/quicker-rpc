using System;
using System.Collections.Generic;
using System.Reflection;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runtime;
using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>
/// Detects how the current action was triggered (e.g. <see cref="ActionTrigger.Extern"/> from qkrpc / URI).
/// Uses root action context so subprogram steps see the parent trigger and input param.
/// </summary>
internal static class ActionExecuteContextProbe
{
    public static ActionTrigger? TryGetActionTrigger(IActionContext? context)
    {
        if (context is null)
        {
            return null;
        }

        var effective = ResolveEffectiveContextObject(context);
        return TryReadActionTrigger(effective);
    }

    public static bool IsExternInvocation(IActionContext? context) =>
        TryGetActionTrigger(context) == ActionTrigger.Extern;

    public static bool IsAutoRunInvocation(IActionContext? context) =>
        TryGetActionTrigger(context) == ActionTrigger.AutoRun;

    public static string? TryGetQuickerInParam(IActionContext? context)
    {
        if (context is null)
        {
            return null;
        }

        var trigger = TryGetActionTrigger(context);
        var raw = TryGetQuickerInParamCore(context);
        return SanitizeQuickerInParamForInteractiveTrigger(trigger, raw);
    }

    private static string? TryGetQuickerInParamCore(IActionContext context)
    {
        var effective = ResolveEffectiveContextObject(context);

        if (effective is ActionExecuteContext executeContext)
        {
            if (!string.IsNullOrWhiteSpace(executeContext.InputParam))
            {
                return executeContext.InputParam;
            }

            if (executeContext.CustomData.TryGetValue("quicker_in_param", out var value))
            {
                return value?.ToString();
            }
        }

        var fromProperty = TryReadStringProperty(effective, "InputParam", "QuickerInParam", "InParam", "ActionInParam");
        if (!string.IsNullOrWhiteSpace(fromProperty))
        {
            return fromProperty;
        }

        if (context is ActionExecuteContext directContext
            && directContext.CustomData.TryGetValue("quicker_in_param", out var directValue))
        {
            return directValue?.ToString();
        }

        var fromVariable = TryGetQuickerInParamVariable(context);
        if (!string.IsNullOrWhiteSpace(fromVariable))
        {
            return fromVariable;
        }

        return TryReadStringProperty(context, "InputParam", "QuickerInParam", "InParam", "ActionInParam");
    }

    /// <summary>
    /// Interactive runs ignore stale RPC-only bootstrap params; context-menu modes like agent-kill are kept.
    /// </summary>
    private static string? SanitizeQuickerInParamForInteractiveTrigger(
        ActionTrigger? actionTrigger,
        string? quickerInParam)
    {
        if (!IsInteractiveUserTrigger(actionTrigger))
        {
            return quickerInParam;
        }

        return LauncherStartOptionsParser.IsPluginOnlyParam(quickerInParam)
            ? null
            : quickerInParam;
    }

    private static bool IsInteractiveUserTrigger(ActionTrigger? actionTrigger) =>
        actionTrigger is not null
        && actionTrigger != ActionTrigger.Extern
        && actionTrigger != ActionTrigger.AutoRun;

    /// <summary>
    /// Context-menu and subprogram flows expose <c>quicker_in_param</c> as an action variable on the root context.
    /// </summary>
    private static string? TryGetQuickerInParamVariable(IActionContext context)
    {
        foreach (var ctx in EnumerateContextChain(context))
        {
            if (ctx is not IActionContext actionContext)
            {
                continue;
            }

            try
            {
                var value = actionContext.GetVarValue("quicker_in_param");
                if (value is string text && !string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }

                if (value is not null && !string.IsNullOrWhiteSpace(value.ToString()))
                {
                    return value.ToString();
                }
            }
            catch
            {
                // Ignore missing variable or obfuscated API failures.
            }
        }

        return null;
    }

    private static IEnumerable<object> EnumerateContextChain(IActionContext context)
    {
        var visited = new HashSet<object>(ReferenceEqualityComparer.Instance);
        IActionContext? current = context;
        while (current is not null && visited.Add(current))
        {
            yield return current;

            IActionContext? root = null;
            try
            {
                root = current.GetRootContext();
            }
            catch
            {
                // Ignore.
            }

            if (root is not null && !ReferenceEquals(root, current) && visited.Add(root))
            {
                yield return root;
            }

            IActionContext? parent = null;
            try
            {
                parent = current.GetParentContext();
            }
            catch
            {
                // Ignore.
            }

            current = parent;
        }
    }

    private static object ResolveEffectiveContextObject(IActionContext context)
    {
        var root = TryGetRootContext(context);
        if (root is not null)
        {
            return ResolveEffectiveContextObject(root);
        }

        if (context is ActionExecuteContext executeContext)
        {
            return ResolveEffectiveContext(executeContext);
        }

        return WalkParentChain(context);
    }

    private static object ResolveEffectiveContextObject(object context)
    {
        if (context is IActionContext actionContext)
        {
            var root = TryGetRootContext(actionContext);
            if (root is not null)
            {
                return ResolveEffectiveContextObject(root);
            }
        }

        if (context is ActionExecuteContext executeContext)
        {
            return ResolveEffectiveContext(executeContext);
        }

        if (TryReadObjectProperty(context, out object? rootProperty, "RootContext") && rootProperty is not null)
        {
            return ResolveEffectiveContextObject(rootProperty);
        }

        return WalkParentChain(context);
    }

    private static object WalkParentChain(object context)
    {
        var current = context;
        var visited = new HashSet<object>(ReferenceEqualityComparer.Instance) { current };
        while (TryGetParentContext(current, out var parent) && parent is not null && visited.Add(parent))
        {
            current = parent;
        }

        return current;
    }

    private static IActionContext? TryGetRootContext(IActionContext context)
    {
        try
        {
            var root = context.GetRootContext();
            if (root is null || ReferenceEquals(root, context) || context.IsRootContext)
            {
                return null;
            }

            return root;
        }
        catch
        {
            return null;
        }
    }

    private static bool TryGetParentContext(object context, out object? parent)
    {
        if (context is IActionContext actionContext)
        {
            try
            {
                parent = actionContext.GetParentContext();
                return parent is not null;
            }
            catch
            {
                // Fall through to property reflection.
            }
        }

        return TryReadObjectProperty(context, out parent, "ParentContext");
    }

    private static ActionExecuteContext ResolveEffectiveContext(ActionExecuteContext context)
    {
        var root = context.RootContext;
        if (root is not null)
        {
            return root;
        }

        var current = context;
        var visited = new HashSet<ActionExecuteContext>(ReferenceEqualityComparer.Instance) { current };
        while (current.ParentContext is ActionExecuteContext parent && visited.Add(parent))
        {
            current = parent;
        }

        return current;
    }

    private static string? TryReadStringProperty(object? instance, params string[] propertyNames)
    {
        if (instance is null)
        {
            return null;
        }

        foreach (var propertyName in propertyNames)
        {
            try
            {
                var property = instance.GetType().GetProperty(
                    propertyName,
                    BindingFlags.Public | BindingFlags.Instance);
                if (property?.GetValue(instance) is string text && !string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }
            catch
            {
                // Ignore reflection failures on obfuscated builds.
            }
        }

        return null;
    }

    private static ActionTrigger? TryReadActionTrigger(object? instance)
    {
        if (instance is null)
        {
            return null;
        }

        try
        {
            var property = instance.GetType().GetProperty(
                "ActionTrigger",
                BindingFlags.Public | BindingFlags.Instance);
            return TryConvertActionTrigger(property?.GetValue(instance));
        }
        catch
        {
            return null;
        }
    }

    private static bool TryReadObjectProperty(object instance, out object? value, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            try
            {
                var property = instance.GetType().GetProperty(
                    propertyName,
                    BindingFlags.Public | BindingFlags.Instance);
                if (property?.GetValue(instance) is { } typed)
                {
                    value = typed;
                    return true;
                }
            }
            catch
            {
                // Ignore reflection failures on obfuscated builds.
            }
        }

        value = null;
        return false;
    }

    private static ActionTrigger? TryConvertActionTrigger(object? value)
    {
        if (value is ActionTrigger trigger)
        {
            return trigger;
        }

        if (value is int intValue)
        {
            return (ActionTrigger)intValue;
        }

        if (value is Enum enumValue)
        {
            return (ActionTrigger)Convert.ToInt32(enumValue);
        }

        return null;
    }

    private sealed class ReferenceEqualityComparer : IEqualityComparer<object>
    {
        public static ReferenceEqualityComparer Instance { get; } = new();

        public new bool Equals(object? x, object? y) => ReferenceEquals(x, y);

        public int GetHashCode(object obj) => System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(obj);
    }
}
