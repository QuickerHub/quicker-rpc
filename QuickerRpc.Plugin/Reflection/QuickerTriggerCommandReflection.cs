using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Resolves <c>TriggerCommandService.SaveGlobalSubProgram(SubProgram)</c> on loaded <c>Quicker.exe</c>
/// (Debug name lookup + Release signature). See <c>quicker-exe-type-probing</c>.
/// </summary>
internal static class QuickerTriggerCommandReflection
{
    private const string DebugServiceTypeFullName = "Quicker.Infrastructure.Data.Services.TriggerCommandService";

    private static readonly HashSet<string> ExcludedServiceTypes = new(StringComparer.Ordinal)
    {
        "Quicker.Domain.Services.DataService",
        "Quicker.Domain.Services.SQLDataMgr",
    };

    internal static Type? TryResolveServiceType(Assembly quickerAssembly)
    {
        var byName = quickerAssembly.GetType(DebugServiceTypeFullName, throwOnError: false);
        if (byName is not null)
        {
            return byName;
        }

        var spType = TryResolveSubProgramType(quickerAssembly);
        if (spType is null)
        {
            return null;
        }

        return QuickerAssemblyReflection.EnumerateTypes(quickerAssembly)
            .FirstOrDefault(t => IsTriggerCommandServiceType(t, spType));
    }

    internal static MethodInfo? TryFindSaveGlobalSubProgram(Assembly quickerAssembly)
    {
        var serviceType = TryResolveServiceType(quickerAssembly);
        return serviceType is null ? null : TryFindSaveGlobalSubProgramOnType(serviceType);
    }

    internal static MethodInfo? TryFindSaveGlobalSubProgramOnType(Type serviceType) =>
        TryFindSubProgramVoidMethod(serviceType, preferLongestIl: true, isDelete: false);

    internal static MethodInfo? TryFindDeleteGlobalSubProgramOnType(Type serviceType) =>
        TryFindSubProgramVoidMethod(serviceType, preferLongestIl: true, isDelete: true);

    internal static MethodInfo? TryFindDeleteGlobalSubProgram(Assembly quickerAssembly)
    {
        var serviceType = TryResolveServiceType(quickerAssembly);
        return serviceType is null ? null : TryFindDeleteGlobalSubProgramOnType(serviceType);
    }

    internal static IReadOnlyList<MethodInfo> ScanSaveGlobalSubProgramMethods(Assembly quickerAssembly)
    {
        var spType = TryResolveSubProgramType(quickerAssembly);
        var matches = new List<MethodInfo>();
        foreach (var type in QuickerAssemblyReflection.EnumerateTypes(quickerAssembly))
        {
            if (!IsTriggerCommandServiceType(type, spType))
            {
                continue;
            }

            var save = TryFindSaveGlobalSubProgramOnType(type);
            if (save is not null)
            {
                matches.Add(save);
            }
        }

        return matches;
    }

    internal static Type? TryResolveSubProgramType(Assembly quickerAssembly) =>
        quickerAssembly.GetType("Quicker.Domain.Actions.X.SubProgram", throwOnError: false);

    internal static Type ResolveSubProgramTypeOrThrow(Assembly quickerAssembly) =>
        TryResolveSubProgramType(quickerAssembly)
        ?? throw new InvalidOperationException("Quicker.Domain.Actions.X.SubProgram not found in " + quickerAssembly.FullName);

    private static bool IsTriggerCommandServiceType(Type type, Type? spType)
    {
        if (!type.IsClass || type.IsAbstract || spType is null)
        {
            return false;
        }

        if (ExcludedServiceTypes.Contains(type.FullName ?? string.Empty))
        {
            return false;
        }

        var save = TryFindSubProgramVoidMethod(type, preferLongestIl: false, isDelete: false, spType: spType);
        if (save is null)
        {
            return false;
        }

        var delete = TryFindSubProgramVoidMethod(type, preferLongestIl: false, isDelete: true, spType: spType);
        if (delete is null)
        {
            return false;
        }

        if (type.GetFields(QuickerAssemblyReflection.InstanceFlags)
            .Any(f => f.FieldType.Name.Contains("SyncV5LocalDataWriter")))
        {
            return true;
        }

        var void0Count = type.GetMethods(QuickerAssemblyReflection.InstanceFlags)
            .Count(m =>
                m.ReturnType == typeof(void)
                && m.GetParameters().Length == 0
                && m.DeclaringType == type);

        return void0Count is >= 3 and <= 12;
    }

    private static MethodInfo? TryFindSubProgramVoidMethod(
        Type serviceType,
        bool preferLongestIl,
        bool isDelete,
        Type? spType = null)
    {
        spType ??= TryResolveSubProgramType(serviceType.Assembly);
        if (spType is null)
        {
            return null;
        }
        var candidates = serviceType
            .GetMethods(QuickerAssemblyReflection.InstanceFlags)
            .Where(m =>
                m.ReturnType == typeof(void)
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == spType
                && m.DeclaringType == serviceType)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        if (candidates.Count == 1)
        {
            return isDelete ? null : candidates[0];
        }

        var ordered = preferLongestIl
            ? candidates.OrderByDescending(m => m.GetMethodBody()?.GetILAsByteArray()?.Length ?? 0).ToList()
            : candidates;

        if (!isDelete)
        {
            return ordered[0];
        }

        return ordered.Count > 1 ? ordered[1] : ordered.Last();
    }
}
