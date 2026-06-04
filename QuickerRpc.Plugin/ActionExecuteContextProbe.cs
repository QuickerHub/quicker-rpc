using System;
using System.Reflection;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runtime;
using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>
/// Detects how the current action was triggered (e.g. <see cref="ActionTrigger.Extern"/> from qkrpc / URI).
/// </summary>
internal static class ActionExecuteContextProbe
{
    public static ActionTrigger? TryGetActionTrigger(IActionContext? context)
    {
        if (context is null)
        {
            return null;
        }

        if (context is ActionExecuteContext executeContext)
        {
            return executeContext.ActionTrigger;
        }

        return TryReadActionTrigger(context);
    }

    public static bool IsExternInvocation(IActionContext? context) =>
        TryGetActionTrigger(context) == ActionTrigger.Extern;

    public static bool IsAutoRunInvocation(IActionContext? context) =>
        TryGetActionTrigger(context) == ActionTrigger.AutoRun;

    private static ActionTrigger? TryReadActionTrigger(IActionContext context)
    {
        try
        {
            var property = context.GetType().GetProperty(
                "ActionTrigger",
                BindingFlags.Public | BindingFlags.Instance);
            if (property?.GetValue(context) is ActionTrigger trigger)
            {
                return trigger;
            }
        }
        catch
        {
            return null;
        }

        return null;
    }
}
