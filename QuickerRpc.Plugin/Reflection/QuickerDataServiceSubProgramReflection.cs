using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Resolves <c>DataService.SaveGlobalSubProgram</c> / <c>DeleteGlobalSubProgram</c> wrappers on
/// legacy Quicker builds (pre-TriggerCommandService). The public wrapper persists via
/// <c>SQLDataMgr</c>, updates memory, then <c>TriggerSync</c>; the inner method is memory-only.
/// </summary>
internal static class QuickerDataServiceSubProgramReflection
{
    private const string SqlDataMgrTypeFullName = "Quicker.Domain.Services.SQLDataMgr";

    internal static MethodInfo? TryFindSaveGlobalSubProgramOnDataService(Type dataServiceType)
    {
        var sqlDataMgrType = dataServiceType.Assembly.GetType(SqlDataMgrTypeFullName, throwOnError: false);
        if (sqlDataMgrType is null)
        {
            return null;
        }

        var spType = typeof(SubProgram);
        var candidates = GetSubProgramVoidMethods(dataServiceType, spType);
        return candidates.FirstOrDefault(m =>
            MethodBodyCallsSubProgramVoidOnType(m, sqlDataMgrType, spType));
    }

    internal static MethodInfo? TryFindDeleteGlobalSubProgramOnDataService(
        Type dataServiceType,
        MethodInfo? saveMethod)
    {
        var sqlDataMgrType = dataServiceType.Assembly.GetType(SqlDataMgrTypeFullName, throwOnError: false);
        if (sqlDataMgrType is null)
        {
            return null;
        }

        var spType = typeof(SubProgram);
        var saveSqlMethod = saveMethod is null
            ? null
            : FindCalledSubProgramVoidOnType(saveMethod, sqlDataMgrType, spType);

        var candidates = GetSubProgramVoidMethods(dataServiceType, spType)
            .Where(m => !ReferenceEquals(m, saveMethod))
            .ToList();

        return candidates.FirstOrDefault(m =>
        {
            var sqlCall = FindCalledSubProgramVoidOnType(m, sqlDataMgrType, spType);
            return sqlCall is not null && !ReferenceEquals(sqlCall, saveSqlMethod);
        });
    }

    internal static bool MethodBodyInvokesTriggerSync(MethodInfo method)
    {
        foreach (var called in EnumerateCalledMethods(method))
        {
            if (called.ReturnType != typeof(void) || called.IsStatic)
            {
                continue;
            }

            var parameters = called.GetParameters();
            if (parameters.Length >= 1 && parameters[0].ParameterType == typeof(bool))
            {
                return true;
            }
        }

        return false;
    }

    private static List<MethodInfo> GetSubProgramVoidMethods(Type serviceType, Type spType) =>
        serviceType
            .GetMethods(QuickerAssemblyReflection.InstanceFlags)
            .Where(m =>
                m.ReturnType == typeof(void)
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == spType
                && m.DeclaringType == serviceType)
            .ToList();

    private static bool MethodBodyCallsSubProgramVoidOnType(
        MethodInfo method,
        Type targetType,
        Type spType) =>
        FindCalledSubProgramVoidOnType(method, targetType, spType) is not null;

    private static MethodInfo? FindCalledSubProgramVoidOnType(
        MethodInfo method,
        Type targetType,
        Type spType)
    {
        foreach (var called in EnumerateCalledMethods(method))
        {
            if (called.DeclaringType is null
                || !targetType.IsAssignableFrom(called.DeclaringType)
                || called.ReturnType != typeof(void)
                || called.GetParameters().Length != 1
                || called.GetParameters()[0].ParameterType != spType)
            {
                continue;
            }

            return called;
        }

        return null;
    }

    private static IEnumerable<MethodInfo> EnumerateCalledMethods(MethodInfo method)
    {
        var body = method.GetMethodBody();
        var il = body?.GetILAsByteArray();
        if (il is null || il.Length == 0)
        {
            yield break;
        }

        for (var i = 0; i < il.Length; i++)
        {
            var op = il[i];
            if (op != 0x28 && op != 0x6F)
            {
                continue;
            }

            if (i + 4 >= il.Length)
            {
                break;
            }

            MethodInfo? called = null;
            try
            {
                called = method.Module.ResolveMethod(BitConverter.ToInt32(il, i + 1)) as MethodInfo;
            }
            catch
            {
                // obfuscated / unresolved token
            }

            if (called is not null)
            {
                yield return called;
            }

            i += 4;
        }
    }
}
