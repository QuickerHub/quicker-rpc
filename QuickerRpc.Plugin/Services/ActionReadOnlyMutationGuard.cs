using System;
using System.Collections.Generic;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Blocks headless mutations on uninstalled shared-action learning ids (shared get / cache only).
/// Locally installed actions remain editable even when linked to a library template.
/// </summary>
internal static class ActionReadOnlyMutationGuard
{
    public const string ReadOnlyLibraryErrorCode = "READ_ONLY_LIBRARY_ACTION";
    public const string ReadOnlySharedErrorCode = "READ_ONLY_SHARED_ACTION";

    public const string ReadOnlyMessage =
        "Shared action is not installed locally. Use action create to author a new action, or install it first.";

    /// <summary>
    /// When the caller passes a shared/template id, resolve to the installed local action id.
    /// </summary>
    public static string ResolveMutationActionId(string actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return string.Empty;
        }

        if (!Guid.TryParse(id, out var guid) || guid == Guid.Empty)
        {
            return id;
        }

        if (TryGetLocalActionItem(id) is not null)
        {
            return id;
        }

        return TryFindLocalActionIdBySharedId(guid) ?? id;
    }

    public static bool IsSharedActionLearningId(string id)
    {
        var text = (id ?? string.Empty).Trim();
        if (!Guid.TryParse(text, out var sharedId) || sharedId == Guid.Empty)
        {
            return false;
        }

        if (TryFindLocalActionIdBySharedId(sharedId) is not null)
        {
            return false;
        }

        foreach (var rev in DataServiceSharedActionLoader.EnumerateRevisionCandidates(sharedId, 0))
        {
            var dto = DataServiceSharedActionLoader.TryLoad(sharedId, rev);
            if (SharedActionBodyResolver.TryGetBodyJson(dto) is not null)
            {
                return true;
            }
        }

        return false;
    }

    public static string? TryFindLocalActionIdBySharedId(Guid sharedId)
    {
        var key = sharedId.ToString("D");
        foreach (var action in EnumerateInstalledActionItems())
        {
            if (!ActionItemSourceHelper.MatchesSharedId(action, key))
            {
                continue;
            }

            var localId = (action.Id ?? string.Empty).Trim();
            return localId.Length > 0 ? localId : null;
        }

        return null;
    }

    public static bool TryBuildPatchFailure(
        ActionItem? action,
        string actionId,
        out QuickerRpcApplyActionPatchResult failure)
    {
        failure = new QuickerRpcApplyActionPatchResult();
        if (action is null && IsSharedActionLearningId(actionId))
        {
            failure = new QuickerRpcApplyActionPatchResult
            {
                Success = false,
                ErrorCode = ReadOnlySharedErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = actionId.Trim(),
            };
            return true;
        }

        return false;
    }

    public static bool TryBuildReplaceFailure(
        ActionItem? action,
        string actionId,
        out QuickerRpcApplyXActionResult failure)
    {
        failure = new QuickerRpcApplyXActionResult();
        if (action is null && IsSharedActionLearningId(actionId))
        {
            failure = new QuickerRpcApplyXActionResult
            {
                Success = false,
                ErrorCode = ReadOnlySharedErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = actionId.Trim(),
            };
            return true;
        }

        return false;
    }

    public static bool TryBuildMetadataFailure(
        ActionItem? action,
        string actionId,
        out QuickerRpcUpdateActionMetadataResult failure)
    {
        failure = new QuickerRpcUpdateActionMetadataResult();
        if (action is null && IsSharedActionLearningId(actionId))
        {
            failure = new QuickerRpcUpdateActionMetadataResult
            {
                Success = false,
                ErrorCode = ReadOnlySharedErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = actionId.Trim(),
            };
            return true;
        }

        return false;
    }

    private static ActionItem? TryGetLocalActionItem(string actionId)
    {
        if (DataServiceActionAccess.TryGetById(actionId, out var action, out _) && action is not null)
        {
            return action;
        }

        return QuickerInternalAccess.TryGetActionById(actionId, out var fromStore) ? fromStore : null;
    }

    private static IEnumerable<ActionItem> EnumerateInstalledActionItems()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in EnumerateDataServiceActionItems())
        {
            var id = (item.Id ?? string.Empty).Trim();
            if (id.Length == 0 || !seen.Add(id))
            {
                continue;
            }

            yield return item;
        }

        foreach (var item in QuickerInternalAccess.EnumerateAllActionItems())
        {
            var id = (item.Id ?? string.Empty).Trim();
            if (id.Length == 0 || !seen.Add(id))
            {
                continue;
            }

            yield return item;
        }
    }

    private static IEnumerable<ActionItem> EnumerateDataServiceActionItems()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            yield break;
        }

        var dataService = AppState.DataService;
        if (dataService is null)
        {
            yield break;
        }

        IEnumerable<ActionItem> items;
        try
        {
            items = dataService.GetAllActionItems();
        }
        catch
        {
            yield break;
        }

        foreach (var item in items)
        {
            if (item is not null)
            {
                yield return item;
            }
        }
    }
}
