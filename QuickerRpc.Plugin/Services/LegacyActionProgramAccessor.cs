using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write XAction programs via <see cref="ActionDesignerProgramAccess"/> (DataService + designer save).
/// </summary>
internal sealed class LegacyActionProgramAccessor
{
    private LegacyActionProgramAccessor()
    {
    }

    public bool IsAvailable => QuickerInternalAccess.IsInQuicker;

    public static LegacyActionProgramAccessor? TryCreate() =>
        QuickerInternalAccess.IsInQuicker ? new LegacyActionProgramAccessor() : null;

    public bool TryGetById(string actionId, out ActionItem? action, out string? error)
    {
        action = null;
        error = null;
        if (!IsAvailable)
        {
            error = "Not running inside Quicker.";
            return false;
        }

        var id = actionId.Trim();
        if (ActionDesignerProgramAccess.TryGetById(id, out action, out _))
        {
            return true;
        }

        if (!ActionProgramPersistence.TryGetLiveActionItem(id, out action) || action is null)
        {
            error = $"Action not found: {actionId}";
            return false;
        }

        return true;
    }

    public IEnumerable<ActionItem> EnumerateAll() => QuickerInternalAccess.EnumerateAllActionItems();

    public bool IsXAction(ActionItem action) => ActionDesignerProgramAccess.IsXAction(action);

    public string? GetPayloadJson(ActionItem action, out string? hydrateError)
    {
        hydrateError = null;
        var actionId = GetActionId(action);
        if (ActionDesignerProgramAccess.TryGetXActionPayloadJson(actionId, out var json, out hydrateError))
        {
            return json;
        }

        return ActionProgramContent.HasProgramContent(action.Data) ? action.Data : null;
    }

    public long GetEditVersion(ActionItem action) => ActionDesignerProgramAccess.GetEditVersionMs(action);

    public (string Title, string Description, string Icon) GetPresentation(ActionItem action) =>
        (action.Title ?? string.Empty, action.Description ?? string.Empty, action.Icon ?? string.Empty);

    public string GetActionId(ActionItem action) => (action.Id ?? string.Empty).Trim();

    public bool TryApplyPayloadAndSave(
        ActionItem sourceAction,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        ActionEditMgrAccessor? actionEditMgr,
        out string? error) =>
        TryApplyPayloadAndSave(sourceAction, steps, variables, subProgramsJson, null, null, null, actionEditMgr, out error);

    public bool TryApplyPayloadAndSave(
        ActionItem sourceAction,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        string? title,
        string? description,
        string? icon,
        ActionEditMgrAccessor? actionEditMgr,
        out string? error)
    {
        _ = actionEditMgr;
        return ActionProgramPersistence.TrySave(
            GetActionId(sourceAction),
            steps,
            variables,
            subProgramsJson,
            title,
            description,
            icon,
            out error);
    }
}
