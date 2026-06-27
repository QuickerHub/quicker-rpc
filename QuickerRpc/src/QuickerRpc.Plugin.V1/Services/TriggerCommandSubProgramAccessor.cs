using System;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Utilities;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Persist global subprograms like Quicker UI: <c>TriggerCommandService.SaveGlobalSubProgram</c>
/// then <c>ISyncService.TriggerSync</c> (multi-account sync). Resolved via <c>QuickerTriggerCommandReflection</c>
/// on loaded <c>Quicker.exe</c> — see <c>quicker-exe-type-probing</c>, not external repo paths.
/// </summary>
internal static class TriggerCommandSubProgramAccessor
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    private static readonly Lazy<object?> Service = new(ResolveTriggerCommandService);
    private static readonly Lazy<MethodInfo?> SaveMethod = new(ResolveSaveMethod);
    private static readonly Lazy<MethodInfo?> DeleteMethod = new(ResolveDeleteMethod);

    public static bool IsAvailable =>
        QuickerHost.IsRunningInQuicker()
        && Service.Value is not null
        && SaveMethod.Value is not null;

    public static bool TrySave(SubProgram subProgram, out string? error)
    {
        error = null;
        if (subProgram is null)
        {
            error = "SubProgram is required.";
            return false;
        }

        var save = SaveMethod.Value;
        var service = Service.Value;
        if (save is null || service is null)
        {
            return false;
        }

        try
        {
            subProgram.LastEditTimeUtc = AppHelper.GetUtcNowForDb();
            save.Invoke(service, new object[] { subProgram });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryDelete(SubProgram subProgram, out string? error)
    {
        error = null;
        if (subProgram is null)
        {
            error = "SubProgram is required.";
            return false;
        }

        var delete = DeleteMethod.Value;
        var service = Service.Value;
        if (delete is null || service is null)
        {
            return false;
        }

        try
        {
            delete.Invoke(service, new object[] { subProgram });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static object? ResolveTriggerCommandService()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        var assembly = typeof(AppState).Assembly;
        var viaProperty = typeof(AppState).GetProperty("TriggerCommandService", StaticFlags)?.GetValue(null);
        if (viaProperty is not null)
        {
            return viaProperty;
        }

        var serviceType = QuickerTriggerCommandReflection.TryResolveServiceType(assembly);
        if (serviceType is null)
        {
            return null;
        }

        return QuickerInternalAccess.TryGetService(serviceType);
    }

    private static MethodInfo? ResolveSaveMethod()
    {
        var service = Service.Value;
        return service is null
            ? null
            : QuickerTriggerCommandReflection.TryFindSaveGlobalSubProgramOnType(service.GetType());
    }

    private static MethodInfo? ResolveDeleteMethod()
    {
        var service = Service.Value;
        return service is null
            ? null
            : QuickerTriggerCommandReflection.TryFindDeleteGlobalSubProgramOnType(service.GetType());
    }
}
