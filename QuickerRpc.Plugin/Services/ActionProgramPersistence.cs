using System;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Persists XAction via designer flow (<see cref="ActionDesignerProgramAccess"/>).
/// </summary>
internal static class ActionProgramPersistence
{
    public static bool TrySave(
        string actionId,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        out string? error) =>
        ActionDesignerProgramAccess.TrySave(actionId, steps, variables, subProgramsJson, out error);

    public static bool TrySave(
        string actionId,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        string? title,
        string? description,
        string? icon,
        out string? error) =>
        ActionDesignerProgramAccess.TrySave(
            actionId,
            steps,
            variables,
            subProgramsJson,
            title,
            description,
            icon,
            out error);

    public static bool TryUpdatePresentation(
        string actionId,
        string? title,
        string? description,
        string? icon,
        out string? error) =>
        ActionDesignerProgramAccess.TryUpdatePresentation(actionId, title, description, icon, out error);

    internal static bool TryGetLiveActionItem(string actionId, out ActionItem? action) =>
        DataServiceActionAccess.TryFindActionWithPayload(actionId, out action)
        || (DataServiceActionAccess.TryGetById(actionId, out action, out _) && action is not null)
        || QuickerInternalAccess.TryGetActionById(actionId, out action);

    public static long ReadEditVersionMs(string actionId) =>
        ActionDesignerProgramAccess.ReadEditVersionMs(actionId);
}
