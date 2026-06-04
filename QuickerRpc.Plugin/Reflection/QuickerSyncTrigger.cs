using System;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Trigger multi-account sync after legacy <see cref="AppState.DataService"/> subprogram writes.
/// Newer Quicker uses <c>TriggerCommandService.SaveGlobalSubProgram</c> which calls this internally.
/// </summary>
internal static class QuickerSyncTrigger
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static readonly Lazy<Action?> TriggerSyncDelegate = new(CreateTriggerSyncDelegate);

    public static void TryTriggerAfterSubProgramSave()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return;
        }

        try
        {
            TriggerSyncDelegate.Value?.Invoke();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Trace.TraceWarning(
                "[QuickerRpc.Plugin] TryTriggerAfterSubProgramSave failed: {0}",
                ex.Message);
        }
    }

    private static Action? CreateTriggerSyncDelegate()
    {
        var syncService = typeof(AppState).GetProperty("SyncService", StaticFlags)?.GetValue(null);
        if (syncService is not null)
        {
            var viaService = TryCreateTriggerSyncOnInstance(syncService);
            if (viaService is not null)
            {
                return viaService;
            }
        }

        return TryCreateTriggerSyncOnInstance(AppState.DataService);
    }

    private static Action? TryCreateTriggerSyncOnInstance(object instance)
    {
        var method = instance.GetType()
            .GetMethods(InstanceFlags)
            .Where(m => m.ReturnType == typeof(void) && !m.IsStatic)
            .FirstOrDefault(IsTriggerSyncMethod);

        if (method is null)
        {
            return null;
        }

        var defaults = BuildDefaultArgs(method.GetParameters());
        return () => method.Invoke(instance, defaults);
    }

    private static bool IsTriggerSyncMethod(MethodInfo method)
    {
        var parameters = method.GetParameters();
        if (parameters.Length == 0 || parameters[0].ParameterType != typeof(bool))
        {
            return false;
        }

        for (var i = 1; i < parameters.Length; i++)
        {
            var type = parameters[i].ParameterType;
            if (type != typeof(bool) && type != typeof(int?) && type != typeof(Nullable<int>))
            {
                return false;
            }
        }

        return true;
    }

    private static object?[] BuildDefaultArgs(ParameterInfo[] parameters)
    {
        var args = new object?[parameters.Length];
        for (var i = 0; i < parameters.Length; i++)
        {
            var type = parameters[i].ParameterType;
            if (type == typeof(bool))
            {
                args[i] = false;
            }
            else if (type == typeof(int?) || type == typeof(Nullable<int>))
            {
                args[i] = null;
            }
            else if (parameters[i].HasDefaultValue)
            {
                args[i] = parameters[i].DefaultValue;
            }
        }

        return args;
    }
}
