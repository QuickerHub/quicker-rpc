using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Services;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write XAction programs the same way as <c>ActionDesignerWindow</c>:
/// load via <see cref="DataService.GetActionById"/> → <see cref="ActionItem.Data"/>;
/// save by updating <c>Data</c> and <c>ActionEditMgr.SaveEditingAction(ActionItem)</c>.
/// </summary>
internal static class ActionDesignerProgramAccess
{
    private static readonly JsonSerializerSettings BodyJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    public static bool TryGetById(string actionId, out ActionItem? action, out ActionProfile? profile) =>
        DataServiceActionAccess.TryGetById(actionId, out action, out profile);

    public static bool TryGetXActionPayloadJson(string actionId, out string? bodyJson, out string? error)
    {
        bodyJson = null;
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return false;
        }

        ActionItem? action = null;
        if (DataServiceActionAccess.TryFindActionWithPayload(id, out action)
            && action is not null
            && TryExtractPayloadFromActionItem(action, out bodyJson))
        {
            return true;
        }

        if (TryGetById(id, out action, out _) && action is not null
            && TryExtractPayloadFromActionItem(action, out bodyJson))
        {
            return true;
        }

        if (action is null)
        {
            TryGetById(id, out action, out _);
        }

        if (SharedActionProgramAccessor.TryGetFromSharedCache(action, id, out bodyJson, out error))
        {
            return true;
        }

        if (TryGetPayloadFromOpenDesigner(id, out bodyJson))
        {
            return true;
        }

        if (SharedActionProgramAccessor.TryGetPayloadFromLegacyFallbacks(id, out bodyJson))
        {
            return true;
        }

        return false;
    }

    public static bool IsXAction(ActionItem action) =>
        action.ActionType == ActionType.XAction
        || ActionProgramContent.HasProgramContent(action.Data);

    public static long GetEditVersionMs(ActionItem action) =>
        ToUnixMilliseconds(action.LastEditTimeUtc);

    public static long ReadEditVersionMs(string actionId)
    {
        if (TryGetById(actionId, out var action, out _) && action is not null)
        {
            return GetEditVersionMs(action);
        }

        return 0;
    }

    public static bool TrySave(
        string actionId,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        out string? error) =>
        TrySave(actionId, steps, variables, subProgramsJson, title: null, description: null, icon: null, contextMenuData: null, out error);

    public static bool TrySave(
        string actionId,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "actionId is required.";
            return false;
        }

        if (!TryGetById(id, out var live, out _) || live is null)
        {
            error = $"Action not found: {id}";
            return false;
        }

        if (title is not null || description is not null || icon is not null || contextMenuData is not null)
        {
            if (!ActionPresentationUpdate.TryApply(live, title, description, icon, contextMenuData, out error))
            {
                return false;
            }
        }

        var existingJson = ActionProgramContent.HasProgramContent(live.Data) ? live.Data : null;
        var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(
            existingJson,
            steps,
            variables,
            subProgramsJson);
        live.ActionType = ActionType.XAction;
        live.Data = bodyJson;
        live.Data2 = string.Empty;
        live.Data3 = string.Empty;

        var xAction = XActionProgramBodyWriter.DeserializeXAction(bodyJson);
        if (!QuickerInternalAccess.TrySaveEditingAction(live, out error))
        {
            return false;
        }

        ActionDesignerUiSave.TrySyncOpenDesignerOnUiThread(id, xAction);
        return true;
    }

    /// <summary>Update title / description / icon / context menu only (does not change XAction program body).</summary>
    public static bool TryUpdatePresentation(
        string actionId,
        string? title,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "actionId is required.";
            return false;
        }

        if (!TryGetById(id, out var live, out _) || live is null)
        {
            error = $"Action not found: {id}";
            return false;
        }

        if (!ActionPresentationUpdate.TryApply(live, title, description, icon, contextMenuData, out error))
        {
            return false;
        }

        if (!QuickerInternalAccess.TrySaveEditingAction(live, out error))
        {
            return false;
        }

        return true;
    }

    private static bool TryExtractPayloadFromActionItem(ActionItem action, out string? bodyJson)
    {
        bodyJson = null;
        if (!ActionProgramContent.IsXActionBody(action.Data))
        {
            return false;
        }

        bodyJson = action.Data;
        return true;
    }

    /// <summary>
    /// When the designer is open, prefer in-memory <c>ResultActionItem.Data</c> or <c>Action</c> (XAction).
    /// </summary>
    private static bool TryGetPayloadFromOpenDesigner(string actionId, out string? bodyJson)
    {
        bodyJson = null;
        var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(actionId, isSubProgram: false);
        if (designer is null)
        {
            return false;
        }

        try
        {
            var winType = designer.GetType();
            var result = winType.GetProperty("ResultActionItem",
                System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.Instance)?.GetValue(designer) as ActionItem;
            if (result is not null && TryExtractPayloadFromActionItem(result, out bodyJson))
            {
                return true;
            }

            if (winType.GetProperty("Action",
                    System.Reflection.BindingFlags.Public
                    | System.Reflection.BindingFlags.NonPublic
                    | System.Reflection.BindingFlags.Instance)?.GetValue(designer) is XAction xAction)
            {
                bodyJson = JsonConvert.SerializeObject(xAction, BodyJson);
                return ActionProgramContent.IsXActionBody(bodyJson);
            }
        }
        catch
        {
            return false;
        }

        return false;
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
