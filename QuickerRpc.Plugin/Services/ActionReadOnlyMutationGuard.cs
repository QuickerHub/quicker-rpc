using System;
using Quicker.Common;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Blocks headless mutations on action-library templates and uninstalled sharedAction learning ids.
/// </summary>
internal static class ActionReadOnlyMutationGuard
{
    public const string ReadOnlyLibraryErrorCode = "READ_ONLY_LIBRARY_ACTION";
    public const string ReadOnlySharedErrorCode = "READ_ONLY_SHARED_ACTION";

    public const string ReadOnlyMessage =
        "Library/shared actions are read-only. Use action create to author a new action.";

    public static bool IsReadOnlyLibraryTemplate(ActionItem action) =>
        ActionItemSourceHelper.IsFromActionLibrary(action) && action.UseTemplate;

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
        foreach (var action in QuickerInternalAccess.EnumerateAllActionItems())
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
        if (action is not null && IsReadOnlyLibraryTemplate(action))
        {
            failure = new QuickerRpcApplyActionPatchResult
            {
                Success = false,
                ErrorCode = ReadOnlyLibraryErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = action.Id,
            };
            return true;
        }

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
        if (action is not null && IsReadOnlyLibraryTemplate(action))
        {
            failure = new QuickerRpcApplyXActionResult
            {
                Success = false,
                ErrorCode = ReadOnlyLibraryErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = action.Id,
            };
            return true;
        }

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
        if (action is not null && IsReadOnlyLibraryTemplate(action))
        {
            failure = new QuickerRpcUpdateActionMetadataResult
            {
                Success = false,
                ErrorCode = ReadOnlyLibraryErrorCode,
                ErrorMessage = ReadOnlyMessage,
                ActionId = action.Id,
            };
            return true;
        }

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
}
