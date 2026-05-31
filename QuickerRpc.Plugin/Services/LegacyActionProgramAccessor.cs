using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write XAction programs via live <see cref="ActionItem"/> from ProfileStore / DataService.
/// </summary>
internal sealed class LegacyActionProgramAccessor
{
    private LegacyActionProgramAccessor()
    {
    }

    public bool IsAvailable => QuickerInternalAccess.IsInQuicker;

    public static LegacyActionProgramAccessor? TryCreate() =>
        QuickerInternalAccess.IsInQuicker
        && (ActionItem2ProgramAccess.IsAvailable || QuickerInternalAccess.IsCatalogAvailable)
            ? new LegacyActionProgramAccessor()
            : null;

    public bool TryGetById(string actionId, out ActionItem? action, out string? error)
    {
        action = null;
        error = null;
        if (!IsAvailable)
        {
            error = "Action catalog store unavailable.";
            return false;
        }

        if (!ActionProgramPersistence.TryGetLiveActionItem(actionId.Trim(), out action) || action is null)
        {
            error = $"Action not found: {actionId}";
            return false;
        }

        return true;
    }

    public IEnumerable<ActionItem> EnumerateAll() => QuickerInternalAccess.EnumerateAllActionItems();

    public bool IsXAction(ActionItem action)
    {
        if (ActionItem2ProgramAccess.TryGetById(GetActionId(action), out var action2, out _)
            && action2 is not null)
        {
            return ActionItem2ProgramAccess.IsXAction(action2!);
        }

        return action.ActionType == ActionType.XAction;
    }

    public string? GetPayloadJson(ActionItem action)
    {
        if (ActionItem2ProgramAccess.TryGetById(GetActionId(action), out var action2, out _)
            && action2 is not null)
        {
            return ActionItem2ProgramAccess.TryGetXActionPayloadJson(action2!);
        }

        return action.Data;
    }

    public long GetEditVersion(ActionItem action)
    {
        if (ActionItem2ProgramAccess.TryGetById(GetActionId(action), out var action2, out _)
            && action2 is not null)
        {
            return ActionItem2ProgramAccess.GetEditVersionMs(action2);
        }

        return ToUnixMilliseconds(action.LastEditTimeUtc);
    }

    public (string Title, string Description, string Icon) GetPresentation(ActionItem action) =>
        (action.Title ?? string.Empty, action.Description ?? string.Empty, action.Icon ?? string.Empty);

    public string GetActionId(ActionItem action) => (action.Id ?? string.Empty).Trim();

    public bool TryApplyPayloadAndSave(
        ActionItem sourceAction,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        ActionEditMgrAccessor? actionEditMgr,
        out string? error)
    {
        _ = actionEditMgr;
        return ActionProgramPersistence.TrySave(GetActionId(sourceAction), steps, variables, subProgramsJson, out error);
    }

    private static long ToUnixMilliseconds(DateTime? dt)
    {
        if (!dt.HasValue)
        {
            return 0;
        }

        var v = dt.Value;
        var utc = v.Kind switch
        {
            DateTimeKind.Utc => v,
            DateTimeKind.Local => v.ToUniversalTime(),
            _ => DateTime.SpecifyKind(v, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }
}
