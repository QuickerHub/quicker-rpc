using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Deletes local Quicker actions via ActionEditMgr (reflection, same approach as ActionUpdateService).
/// </summary>
public sealed class ActionDeleteService
{
    private readonly object? _actionEditMgr;
    private readonly MethodInfo? _deleteActionMethod;

    public ActionDeleteService()
    {
        _actionEditMgr = TryGetActionEditMgr(out var deleteMethod);
        _deleteActionMethod = deleteMethod;
    }

    public async Task<QuickerRpcActionUpdateResult> DeleteActionAsync(string actionId, bool showConfirm)
    {
        if (_actionEditMgr is null || _deleteActionMethod is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = "Not running inside Quicker (ActionEditMgr unavailable).",
            };
        }

        if (!TryResolveActionContext(actionId, out var pageOrProfile, out var action, out var errorMessage))
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = errorMessage ?? $"Action not found: {actionId}",
            };
        }

        try
        {
            var pending = _deleteActionMethod.Invoke(
                _actionEditMgr,
                new object[] { pageOrProfile, action, showConfirm, false });
            if (pending is not Task task)
            {
                return new QuickerRpcActionUpdateResult
                {
                    Ok = false,
                    ActionId = actionId,
                    Message = "DeleteAction did not return Task.",
                };
            }

            await task.ConfigureAwait(true);
            var deleted = ReadTaskBoolResult(task);
            return new QuickerRpcActionUpdateResult
            {
                Ok = deleted,
                ActionId = actionId,
                Message = deleted ? "动作已删除。" : "删除动作已取消或失败。",
            };
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = ex.InnerException.Message,
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = ex.Message,
            };
        }
    }

    private static bool TryResolveActionContext(
        string actionId,
        out object pageOrProfile,
        out object action,
        out string? errorMessage)
    {
        pageOrProfile = null!;
        action = null!;
        errorMessage = null;

        if (TryResolveViaRuntimeLookup(actionId, out pageOrProfile, out action, out errorMessage))
        {
            return true;
        }

        return TryResolveViaDataService(actionId, out pageOrProfile, out action, out errorMessage);
    }

    private static bool TryResolveViaRuntimeLookup(
        string actionId,
        out object pageOrProfile,
        out object action,
        out string? errorMessage)
    {
        pageOrProfile = null!;
        action = null!;
        errorMessage = null;

        try
        {
            var lookupType = typeof(AppState).Assembly.GetType(
                "Quicker.Modules.ActionExecution.Services.ActionRuntimeLookupService",
                throwOnError: false)
                ?? typeof(AppState).Assembly.GetType(
                    "Quicker.Domain.Services.ActionRuntimeLookupService",
                    throwOnError: false);
            if (lookupType is null)
            {
                return false;
            }

            var lookup = ResolveAppStateService(lookupType);
            if (lookup is null)
            {
                return false;
            }

            var getWithLocation = lookupType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "GetActionWithLocationByIdOrNameOrSourceId", StringComparison.Ordinal)
                    && m.GetParameters().Length == 2
                    && m.GetParameters()[0].ParameterType == typeof(string));
            if (getWithLocation is null)
            {
                return false;
            }

            var raw = getWithLocation.Invoke(lookup, new object[] { actionId, false });
            if (raw is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            var actionValue = ReadTupleItem(raw, 0, "Item1", "action");
            if (actionValue is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            var location = ReadTupleItem(raw, 1, "Item2", "location");
            var message = ReadTupleItem(raw, 2, "Item3", "message") as string;
            if (location is null)
            {
                errorMessage = string.IsNullOrWhiteSpace(message) ? $"Action not found: {actionId}" : message;
                return false;
            }

            var pageIdValue = location.GetType().GetProperty("PageId")?.GetValue(location);
            if (pageIdValue is not Guid pageId || pageId == Guid.Empty)
            {
                errorMessage = string.IsNullOrWhiteSpace(message) ? $"Action page not found: {actionId}" : message;
                return false;
            }

            var page = ResolveActionPage(pageId);
            if (page is null)
            {
                errorMessage = $"Action page not found: {actionId}";
                return false;
            }

            pageOrProfile = page;
            action = actionValue;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryResolveViaDataService(
        string actionId,
        out object pageOrProfile,
        out object action,
        out string? errorMessage)
    {
        pageOrProfile = null!;
        action = null!;
        errorMessage = null;

        try
        {
            var dataService = typeof(AppState).GetProperty("DataService", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            if (dataService is null)
            {
                return false;
            }

            var getById = dataService.GetType().GetMethod(
                "GetActionById",
                BindingFlags.Public | BindingFlags.Instance,
                binder: null,
                types: new[] { typeof(string) },
                modifiers: null);
            if (getById is null)
            {
                return false;
            }

            var raw = getById.Invoke(dataService, new object[] { actionId });
            if (raw is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            var actionValue = ReadTupleItem(raw, 0, "Item1", "action");
            var profileValue = ReadTupleItem(raw, 1, "Item2", "profile");
            if (actionValue is null || profileValue is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            pageOrProfile = profileValue;
            action = actionValue;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static object? ResolveActionPage(Guid pageId)
    {
        var queryType = typeof(AppState).Assembly.GetType(
            "Quicker.Domain.Services.Actions.ActionPageRuntimeQueryService",
            throwOnError: false);
        if (queryType is null)
        {
            return null;
        }

        var query = ResolveAppStateService(queryType);
        if (query is null)
        {
            return null;
        }

        var getPage = queryType.GetMethod("GetPage", BindingFlags.Public | BindingFlags.Instance);
        return getPage?.Invoke(query, new object[] { pageId });
    }

    private static object? ResolveAppStateService(Type serviceType)
    {
        var getService = typeof(AppState).GetMethod(
            "GetService",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(Type) },
            modifiers: null);
        return getService?.Invoke(null, new object[] { serviceType });
    }

    private static object? ReadTupleItem(object tuple, int index, string itemName, string? namedField)
    {
        var valueType = tuple.GetType();
        if (namedField is not null)
        {
            var named = valueType.GetField(namedField)?.GetValue(tuple);
            if (named is not null)
            {
                return named;
            }
        }

        return valueType.GetField(itemName)?.GetValue(tuple)
            ?? valueType.GetProperty(itemName)?.GetValue(tuple);
    }

    private static bool ReadTaskBoolResult(Task completedTask)
    {
        var resultProperty = completedTask.GetType().GetProperty("Result");
        return resultProperty?.GetValue(completedTask) is bool value && value;
    }

    private static object? TryGetActionEditMgr(out MethodInfo? deleteActionMethod)
    {
        deleteActionMethod = null;
        if (!IsInQuicker())
        {
            return null;
        }

        try
        {
            var mgrType = typeof(AppState).Assembly.GetType("Quicker.Domain.Services.ActionEditMgr", throwOnError: false);
            if (mgrType is null)
            {
                return null;
            }

            var mgr = typeof(AppState).GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
                .FirstOrDefault(x => x.ReturnType == mgrType)
                ?.Invoke(null, null);
            if (mgr is null)
            {
                return null;
            }

            deleteActionMethod = mgrType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "DeleteAction", StringComparison.Ordinal)
                    && m.GetParameters().Length == 4
                    && m.ReturnType.IsGenericType
                    && m.ReturnType.GetGenericTypeDefinition() == typeof(Task<>)
                    && m.ReturnType.GetGenericArguments()[0] == typeof(bool));

            return deleteActionMethod is null ? null : mgr;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }
}
