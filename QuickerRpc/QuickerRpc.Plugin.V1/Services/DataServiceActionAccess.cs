using System;
using System.Collections.Generic;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Services;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves actions via <see cref="DataService"/> (same entry as designer).
/// </summary>
internal static class DataServiceActionAccess
{
    public static bool TryGetById(string actionId, out ActionItem? action, out ActionProfile? profile)
    {
        action = null;
        profile = null;
        if (!QuickerHost.IsRunningInQuicker())
        {
            return false;
        }

        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return false;
        }

        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return false;
        }

        try
        {
            (action, profile) = dataService.GetActionById(id);
            return action is not null;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// When <see cref="GetActionById"/> returns a stub (empty <c>Data</c>), scan full catalog lists.
    /// </summary>
    public static bool TryFindActionWithPayload(string actionId, out ActionItem? action)
    {
        action = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return false;
        }

        if (TryGetById(id, out action, out _) && action is not null
            && ActionProgramContent.HasProgramContent(action.Data))
        {
            return true;
        }

        if (TryFindInDataServiceAllItems(id, out action))
        {
            return true;
        }

        if (QuickerInternalAccess.TryGetActionById(id, out var fromStore)
            && fromStore is not null
            && ActionProgramContent.HasProgramContent(fromStore.Data))
        {
            action = fromStore;
            return true;
        }

        foreach (var item in QuickerInternalAccess.EnumerateAllActionItems())
        {
            if (!ActionIdMatches(item, id))
            {
                continue;
            }

            if (ActionProgramContent.HasProgramContent(item.Data))
            {
                action = item;
                return true;
            }
        }

        return false;
    }

    private static bool TryFindInDataServiceAllItems(string actionId, out ActionItem? action)
    {
        action = null;
        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return false;
        }

        try
        {
            foreach (var item in dataService.GetAllActionItems())
            {
                if (item is null || !ActionIdMatches(item, actionId))
                {
                    continue;
                }

                if (ActionProgramContent.HasProgramContent(item.Data))
                {
                    action = item;
                    return true;
                }
            }
        }
        catch
        {
            return false;
        }

        return false;
    }

    private static bool ActionIdMatches(ActionItem item, string actionId)
    {
        var localId = (item.Id ?? string.Empty).Trim();
        if (string.Equals(localId, actionId, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var sharedId = (item.SharedActionId ?? string.Empty).Trim();
        if (sharedId.Length > 0
            && string.Equals(sharedId, actionId, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var templateId = (item.TemplateId ?? string.Empty).Trim();
        return templateId.Length > 0
            && string.Equals(templateId, actionId, StringComparison.OrdinalIgnoreCase);
    }
}
