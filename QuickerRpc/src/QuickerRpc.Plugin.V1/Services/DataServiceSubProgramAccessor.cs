using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.SubPrograms;
using Quicker.Utilities;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read global subprograms via <see cref="AppState.DataService"/>.
/// Save/delete prefer <see cref="TriggerCommandSubProgramAccessor"/> (Sync V5 + account cloud sync); legacy DataService reflection as fallback.
/// </summary>
internal sealed class DataServiceSubProgramAccessor
{
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static readonly Lazy<MethodInfo?> SaveMethod = new(ResolveSaveMethod);
    private static readonly Lazy<MethodInfo?> DeleteMethod = new(ResolveDeleteMethod);

    private DataServiceSubProgramAccessor()
    {
    }

    public static DataServiceSubProgramAccessor? TryCreate() =>
        QuickerHost.IsRunningInQuicker() ? new DataServiceSubProgramAccessor() : null;

    public bool TryGetByIdOrName(string idOrName, out SubProgram? subProgram, out string? error)
    {
        subProgram = null;
        error = null;
        var key = (idOrName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            error = "subProgram id or name is required.";
            return false;
        }

        try
        {
            subProgram = AppState.DataService.GetGlobalSubProgram(key);
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }

        if (subProgram is null || string.IsNullOrWhiteSpace(subProgram.Id))
        {
            error = $"Global subprogram not found: {key}";
            return false;
        }

        return true;
    }

    public IEnumerable<SubProgram> EnumerateAll()
    {
        try
        {
            return AppState.DataService.GlobalSubPrograms.Cast<SubProgram>().Where(sp => sp is not null);
        }
        catch
        {
            return Array.Empty<SubProgram>();
        }
    }

    public static string GetCallIdentifier(SubProgram subProgram) =>
        SubProgramHelper.GetGlobalSubProgramIdentifier(subProgram);

    public static bool IsValidName(string name) =>
        SubProgramHelper.IsValidSubProgramName(name);

    public long GetEditVersion(SubProgram subProgram)
    {
        if (subProgram.LastEditTimeUtc is DateTime dt)
        {
            return ToUnixMilliseconds(dt);
        }

        return ToUnixMilliseconds(subProgram.CreateTimeUtc);
    }

    public bool TrySave(SubProgram subProgram, out string? error)
    {
        error = null;
        if (subProgram is null)
        {
            error = "SubProgram is required.";
            return false;
        }

        if (TriggerCommandSubProgramAccessor.TrySave(subProgram, out error))
        {
            return true;
        }

        var save = SaveMethod.Value;
        if (save is null)
        {
            error = error ?? "TriggerCommandService/DataService SaveGlobalSubProgram unavailable.";
            return false;
        }

        try
        {
            subProgram.LastEditTimeUtc = AppHelper.GetUtcNowForDb();
            save.Invoke(AppState.DataService, new object[] { subProgram });
            if (!QuickerDataServiceSubProgramReflection.MethodBodyInvokesTriggerSync(save))
            {
                QuickerSyncTrigger.TryTriggerAfterSubProgramSave();
            }

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

    public bool TryDelete(SubProgram subProgram, out string? error)
    {
        error = null;
        if (subProgram is null)
        {
            error = "SubProgram is required.";
            return false;
        }

        if (TriggerCommandSubProgramAccessor.TryDelete(subProgram, out error))
        {
            return true;
        }

        var delete = DeleteMethod.Value;
        if (delete is null)
        {
            error = error ?? "TriggerCommandService/DataService DeleteGlobalSubProgram unavailable.";
            return false;
        }

        try
        {
            delete.Invoke(AppState.DataService, new object[] { subProgram });
            if (!QuickerDataServiceSubProgramReflection.MethodBodyInvokesTriggerSync(delete))
            {
                QuickerSyncTrigger.TryTriggerAfterSubProgramSave();
            }

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

    private static MethodInfo? ResolveSaveMethod()
    {
        var dataServiceType = AppState.DataService.GetType();
        return QuickerDataServiceSubProgramReflection.TryFindSaveGlobalSubProgramOnDataService(dataServiceType)
            ?? ResolveSubProgramMethod(preferLongestIl: false);
    }

    private static MethodInfo? ResolveDeleteMethod()
    {
        var save = SaveMethod.IsValueCreated ? SaveMethod.Value : ResolveSaveMethod();
        var dataServiceType = AppState.DataService.GetType();
        return QuickerDataServiceSubProgramReflection.TryFindDeleteGlobalSubProgramOnDataService(dataServiceType, save)
            ?? ResolveSubProgramMethodByExclusion(save);
    }

    private static MethodInfo? ResolveSubProgramMethodByExclusion(MethodInfo? save)
    {
        var candidates = GetSubProgramVoidMethods();
        return candidates
            .Where(m => !ReferenceEquals(m, save))
            .OrderByDescending(m => m.GetMethodBody()?.GetILAsByteArray()?.Length ?? 0)
            .FirstOrDefault();
    }

    private static MethodInfo? ResolveSubProgramMethod(bool preferLongestIl)
    {
        var candidates = GetSubProgramVoidMethods();
        if (candidates.Count == 0)
        {
            return null;
        }

        return preferLongestIl
            ? candidates.OrderByDescending(m => m.GetMethodBody()?.GetILAsByteArray()?.Length ?? 0).First()
            : candidates.First();
    }

    private static List<MethodInfo> GetSubProgramVoidMethods()
    {
        var spType = typeof(SubProgram);
        return AppState.DataService.GetType()
            .GetMethods(InstanceFlags)
            .Where(m =>
                m.ReturnType == typeof(void)
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == spType)
            .ToList();
    }

    private static long ToUnixMilliseconds(DateTime dt)
    {
        var utc = dt.Kind switch
        {
            DateTimeKind.Utc => dt,
            DateTimeKind.Local => dt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }
}
