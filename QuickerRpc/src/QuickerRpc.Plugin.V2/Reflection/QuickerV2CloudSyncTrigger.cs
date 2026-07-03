using System.Reflection;

namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>
/// V2 headless persist goes through <see cref="QuickerV2SubProgramAccessor"/> /
/// <see cref="QuickerV2ActionAccessor"/> directly, bypassing UI save paths that call
/// <c>ISyncService.TriggerSync</c>. Mirror V1 <c>QuickerSyncTrigger</c> behavior.
/// </summary>
internal static class QuickerV2CloudSyncTrigger
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static readonly Lazy<SyncInvoker?> Invoker = new(CreateSyncInvoker);

    public static void TryTriggerAfterPersist()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return;
        }

        try
        {
            var invoker = Invoker.Value;
            if (invoker is null)
            {
                System.Diagnostics.Trace.TraceWarning(
                    "[QuickerRpc.Plugin.V2] Cloud sync trigger unavailable: {0}",
                    DescribeProbe());
                return;
            }

            var pendingBefore = TryGetPendingSyncItemCount(invoker.Instance);
            invoker.Trigger();
            var pendingAfter = TryGetPendingSyncItemCount(invoker.Instance);
            System.Diagnostics.Trace.TraceInformation(
                "[QuickerRpc.Plugin.V2] Cloud sync triggered ({0}); pending {1} -> {2}",
                invoker.Mode,
                pendingBefore?.ToString() ?? "?",
                pendingAfter?.ToString() ?? "?");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Trace.TraceWarning(
                "[QuickerRpc.Plugin.V2] TryTriggerAfterPersist failed: {0}",
                ex.Message);
        }
    }

    public static string DescribeProbe()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return "entry assembly is not Quicker.";
        }

        var parts = new List<string>();
        var syncServiceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.ISyncService);
        if (syncServiceType is null)
        {
            parts.Add("type missing: ISyncService");
        }
        else
        {
            var syncService = QuickerV2Runtime.TryGetService(syncServiceType);
            parts.Add(syncService is null
                ? $"service null: ISyncService ({syncServiceType.Assembly.GetName().Name})"
                : $"ok: ISyncService ({syncService.GetType().FullName})");
        }

        var invoker = Invoker.Value;
        parts.Add(invoker is null
            ? "trigger delegate: null"
            : $"trigger delegate: {invoker.Mode}");

        if (invoker is not null)
        {
            var pending = TryGetPendingSyncItemCount(invoker.Instance);
            parts.Add(pending.HasValue
                ? $"pendingSyncItems: {pending.Value}"
                : "pendingSyncItems: unavailable");
        }

        return string.Join("; ", parts);
    }

    private static SyncInvoker? CreateSyncInvoker()
    {
        var syncService = TryResolveSyncService();
        if (syncService is null)
        {
            return null;
        }

        var trigger = TryCreateTriggerSyncDelegate(syncService);
        if (trigger is not null)
        {
            return new SyncInvoker(syncService, trigger, "TriggerSync");
        }

        var sync = TryCreateParameterlessSyncDelegate(syncService);
        if (sync is not null)
        {
            return new SyncInvoker(syncService, sync, "Sync");
        }

        return null;
    }

    private static object? TryResolveSyncService()
    {
        foreach (var typeName in new[]
                 {
                     QuickerV2TypeNames.ISyncService,
                     QuickerV2TypeNames.SyncService,
                 })
        {
            var syncServiceType = QuickerV2Runtime.ResolveType(typeName);
            if (syncServiceType is null)
            {
                continue;
            }

            var syncService = QuickerV2Runtime.TryGetService(syncServiceType);
            if (syncService is not null)
            {
                return syncService;
            }
        }

        var appStateType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.AppState);
        return appStateType?
            .GetProperty("SyncService", StaticFlags)?
            .GetValue(null);
    }

    private static int? TryGetPendingSyncItemCount(object syncService)
    {
        try
        {
            var method = syncService.GetType().GetMethod(
                "GetPendingSyncItemCount",
                InstanceFlags,
                binder: null,
                types: Type.EmptyTypes,
                modifiers: null);
            if (method is null)
            {
                return null;
            }

            return method.Invoke(syncService, null) switch
            {
                int value => value,
                _ => null,
            };
        }
        catch
        {
            return null;
        }
    }

    private static Action? TryCreateTriggerSyncDelegate(object instance)
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

    private static Action? TryCreateParameterlessSyncDelegate(object instance)
    {
        var method = instance.GetType().GetMethod(
            "Sync",
            InstanceFlags,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (method is null || method.ReturnType != typeof(void))
        {
            return null;
        }

        return () => method.Invoke(instance, null);
    }

    private static bool IsTriggerSyncMethod(MethodInfo method)
    {
        if (!string.Equals(method.Name, "TriggerSync", StringComparison.Ordinal))
        {
            return false;
        }

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

    private sealed class SyncInvoker(object instance, Action trigger, string mode)
    {
        public object Instance { get; } = instance;

        public string Mode { get; } = mode;

        public void Trigger() => trigger();
    }
}
