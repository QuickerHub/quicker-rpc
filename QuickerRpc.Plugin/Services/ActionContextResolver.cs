using System;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves a local Quicker action id to page/profile and action objects for ActionEditMgr calls.
/// </summary>
internal static class ActionContextResolver
{
    public static bool TryResolve(
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
            var dataService = AppState.DataService;
            if (dataService is null)
            {
                return false;
            }

            var (actionItem, profile) = dataService.GetActionById(actionId.Trim());
            if (actionItem is null || profile is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            pageOrProfile = profile;
            action = actionItem;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
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

        var query = QuickerInternalAccess.TryGetService(queryType);
        if (query is null)
        {
            return null;
        }

        var getPage = queryType.GetMethod("GetPage", BindingFlags.Public | BindingFlags.Instance);
        return getPage?.Invoke(query, new object[] { pageId });
    }

    private static object? ResolveAppStateService(Type serviceType) =>
        QuickerInternalAccess.TryGetService(serviceType);

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
}
