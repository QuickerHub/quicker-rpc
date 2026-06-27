using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Common.Vm;
using Quicker.Domain;
using Quicker.Domain.Services;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Loads shared-action program payloads the same way as <c>ActionEditMgr.EditAction</c> and
/// <c>AppServer</c> run: <see cref="DataService.GetSharedActionAsync"/> (memory → SQL → network).
/// </summary>
internal static class DataServiceSharedActionLoader
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;

    public static SharedActionDto? TryLoad(Guid sharedActionId, int revision) =>
        QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => TryLoadCore(sharedActionId, revision));

    public static IEnumerable<int> EnumerateRevisionCandidates(Guid sharedActionId, int preferredRevision)
    {
        yield return preferredRevision;

        foreach (var rev in EnumerateLocalRevisions(sharedActionId))
        {
            if (rev != preferredRevision)
            {
                yield return rev;
            }
        }

        if (preferredRevision != 0)
        {
            yield return 0;
        }
    }

    private static SharedActionDto? TryLoadCore(Guid sharedActionId, int revision)
    {
        if (sharedActionId == Guid.Empty)
        {
            return null;
        }

        var fromCache = DataServiceSharedActionCache.Get(sharedActionId, revision);
        if (fromCache is not null)
        {
            return fromCache;
        }

        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return null;
        }

        var dto = InvokeGetSharedActionAsync(dataService, sharedActionId, revision);
        if (dto is not null)
        {
            return dto;
        }

        return InvokeGetSharedActionSql(dataService, sharedActionId, revision);
    }

    private static SharedActionDto? InvokeGetSharedActionAsync(DataService dataService, Guid sharedActionId, int revision)
    {
        var method = FindGetSharedActionAsyncMethod(dataService.GetType());
        if (method is null)
        {
            return null;
        }

        try
        {
            var task = (Task<SharedActionDto>)method.Invoke(dataService, new object[] { sharedActionId, revision })!;
            return task.ConfigureAwait(false).GetAwaiter().GetResult();
        }
        catch
        {
            return null;
        }
    }

    private static SharedActionDto? InvokeGetSharedActionSql(DataService dataService, Guid sharedActionId, int revision)
    {
        var getMethod = FindSqlGetSharedActionMethod(dataService);
        if (getMethod is null)
        {
            return null;
        }

        try
        {
            return Task.Run(() =>
                {
                    var sqlMgr = getMethod.Value.SqlField.GetValue(dataService);
                    if (sqlMgr is null)
                    {
                        return null;
                    }

                    return (SharedActionDto?)getMethod.Value.Method.Invoke(sqlMgr, new object[]
                    {
                        sharedActionId.ToString(),
                        revision,
                    });
                })
                .ConfigureAwait(false)
                .GetAwaiter()
                .GetResult();
        }
        catch
        {
            return null;
        }
    }

    private static IEnumerable<int> EnumerateLocalRevisions(Guid sharedActionId)
    {
        var dataService = AppState.DataService;
        if (dataService is null)
        {
            yield break;
        }

        var listMethod = FindSqlListRevisionsMethod(dataService);
        if (listMethod is null)
        {
            yield break;
        }

        IList<object>? items = null;
        try
        {
            items = Task.Run(() =>
                {
                    var sqlMgr = listMethod.Value.SqlField.GetValue(dataService);
                    if (sqlMgr is null)
                    {
                        return null;
                    }

                    return (IList<object>?)listMethod.Value.Method.Invoke(sqlMgr, new object[] { sharedActionId.ToString() });
                })
                .ConfigureAwait(false)
                .GetAwaiter()
                .GetResult();
        }
        catch
        {
            yield break;
        }

        if (items is null)
        {
            yield break;
        }

        foreach (var item in items)
        {
            if (item is null)
            {
                continue;
            }

            var revProp = item.GetType().GetProperty("Revision", InstanceFlags);
            if (revProp?.GetValue(item) is int rev)
            {
                yield return rev;
            }
        }
    }

    private static MethodInfo? FindGetSharedActionAsyncMethod(Type dataServiceRuntimeType) =>
        dataServiceRuntimeType
            .GetMethods(InstanceFlags)
            .FirstOrDefault(m =>
                m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(Guid)
                && m.GetParameters()[1].ParameterType == typeof(int)
                && m.ReturnType.IsGenericType
                && m.ReturnType.GetGenericTypeDefinition() == typeof(Task<>)
                && m.ReturnType.GetGenericArguments()[0] == typeof(SharedActionDto));

    private static (FieldInfo SqlField, MethodInfo Method)? FindSqlGetSharedActionMethod(DataService dataService)
    {
        var sqlField = dataService.GetType()
            .GetFields(InstanceFlags)
            .FirstOrDefault(f => f.FieldType.Name == "SQLDataMgr");
        if (sqlField is null)
        {
            return null;
        }

        var getMethod = sqlField.FieldType
            .GetMethods(InstanceFlags)
            .FirstOrDefault(m =>
                m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(string)
                && m.GetParameters()[1].ParameterType == typeof(int)
                && m.ReturnType == typeof(SharedActionDto));
        if (getMethod is null)
        {
            return null;
        }

        return (sqlField, getMethod);
    }

    private static (FieldInfo SqlField, MethodInfo Method)? FindSqlListRevisionsMethod(DataService dataService)
    {
        var sqlField = dataService.GetType()
            .GetFields(InstanceFlags)
            .FirstOrDefault(f => f.FieldType.Name == "SQLDataMgr");
        if (sqlField is null)
        {
            return null;
        }

        var listMethod = sqlField.FieldType
            .GetMethods(InstanceFlags)
            .FirstOrDefault(m =>
                m.Name == "GetHistoryRevisions"
                && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == typeof(string));
        if (listMethod is null)
        {
            return null;
        }

        return (sqlField, listMethod);
    }
}
