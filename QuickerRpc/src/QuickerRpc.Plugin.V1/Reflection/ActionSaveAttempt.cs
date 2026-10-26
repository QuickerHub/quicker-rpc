using System;
using System.Reflection;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>Tracks persistence at the native call boundary, including an ambiguous thrown save.</summary>
internal static class ActionSaveAttempt
{
    public static bool TrySave<T>(Func<T> prepare, Action<T>? nativeSave, out string? error, out bool? persisted)
    {
        error = null;
        persisted = false;
        if (nativeSave is null)
        {
            error = "SaveEditingAction unavailable.";
            return false;
        }

        T value;
        try
        {
            value = prepare();
        }
        catch (Exception ex)
        {
            error = FailureMessage(ex);
            return false;
        }

        // Native code may commit before throwing. An exception cannot establish rejection.
        persisted = null;
        try
        {
            nativeSave(value);
            persisted = true;
            return true;
        }
        catch (Exception ex)
        {
            error = FailureMessage(ex);
            return false;
        }
    }

    internal static string FailureMessage(Exception exception) =>
        exception is TargetInvocationException invocation
            ? invocation.InnerException?.Message ?? invocation.Message
            : exception.Message;
}
