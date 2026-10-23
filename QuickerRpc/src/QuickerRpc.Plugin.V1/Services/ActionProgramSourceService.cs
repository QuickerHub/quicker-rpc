using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services.Search;

namespace QuickerRpc.Plugin.Services;

/// <summary>Native source operations run entirely on the UI dispatcher to keep guards and saves together.</summary>
internal static class ActionProgramSourceService
{
    public static QuickerRpcGetActionProgramSourceResult Get(string actionId)
    {
        var id = ActionReadOnlyMutationGuard.ResolveMutationActionId(actionId.Trim());
        try
        {
            if (!DataServiceActionAccess.TryGetById(id, out var action, out _) || action is null)
            {
                return ReadFailure(id, "ACTION_NOT_FOUND", "Action not found: " + id);
            }

            if (!ActionDesignerProgramAccess.IsXAction(action))
            {
                return ReadFailure(id, "NOT_XACTION", "Action is not an XAction program: " + id);
            }

            if (!TryReadCatalogBody(action, id, out var body, out var error))
            {
                return ReadFailure(id, "SOURCE_READ_FAILED", error ?? "Catalog program body is unavailable.");
            }

            EnsureArray(body!, "steps", "Steps");
            EnsureArray(body!, "variables", "Variables");
            EnsureArray(body!, "subPrograms", "SubPrograms");
            var result = new QuickerRpcGetActionProgramSourceResult
            {
                Success = true,
                ActionId = action.Id,
                EditVersion = ActionDesignerProgramAccess.GetEditVersionMs(action),
                BodyJson = body!.ToString(Formatting.None),
                ReadSource = ActionDesignerProgramBridge.ReadSourceCatalog,
                Title = action.Title,
                Description = action.Description,
                Icon = action.Icon,
                ContextMenuData = action.ContextMenuData,
            };
            if (ActionDesignerUiSave.TryFindActionDesignerWindow(id, isSubProgram: false) is not null)
            {
                result.Warnings.Add("Action Designer is open. This source contains the saved catalog body; close the designer and re-read before applying.");
            }

            return result;
        }
        catch (Exception ex)
        {
            return ReadFailure(id, "SOURCE_READ_FAILED", ex.Message);
        }
    }

    public static QuickerRpcApplyXActionResult Apply(string actionId, string bodyJson, long? expectedEditVersion, bool force)
    {
        var id = ActionReadOnlyMutationGuard.ResolveMutationActionId(actionId.Trim());
        try
        {
            // Force only bypasses catalog version conflicts, never an in-memory designer draft.
            if (ActionDesignerUiSave.TryFindActionDesignerWindow(id, isSubProgram: false) is not null)
            {
                return WriteFailure(id, "DESIGNER_OPEN", "Close Action Designer and re-read the action source before applying.");
            }

            if (!DataServiceActionAccess.TryGetById(id, out var action, out _) || action is null)
            {
                return WriteFailure(id, "ACTION_NOT_FOUND", "Action not found: " + id);
            }

            if (ActionReadOnlyMutationGuard.TryBuildReplaceFailure(action, id, out var readOnly))
            {
                return readOnly;
            }

            if (!ActionDesignerProgramAccess.IsXAction(action))
            {
                return WriteFailure(id, "NOT_XACTION", "Action is not an XAction program: " + id);
            }

            var versionBefore = ActionDesignerProgramAccess.GetEditVersionMs(action);
            if (!force && (!expectedEditVersion.HasValue || expectedEditVersion.Value != versionBefore))
            {
                return new QuickerRpcApplyXActionResult
                {
                    ActionId = id,
                    ErrorCode = expectedEditVersion.HasValue ? "VERSION_CONFLICT" : "MISSING_EDIT_VERSION",
                    ErrorMessage = "Action changed in Quicker. Re-read the action source before applying.",
                    EditVersion = versionBefore,
                    VersionConflict = expectedEditVersion.HasValue,
                };
            }

            if (!TryReadCatalogBody(action, id, out var catalogBody, out var readError))
            {
                return WriteFailure(id, "SOURCE_READ_FAILED", readError ?? "Cannot preserve catalog program metadata.");
            }

            string nativeJson;
            try
            {
                nativeJson = NativeActionProgramSourceBody.Merge(catalogBody!, NativeActionProgramSourceBody.Parse(bodyJson));
                // Validate host compatibility without serializing through its fixed schema.
                _ = XActionProgramBodyWriter.DeserializeXAction(nativeJson);
            }
            catch (InvalidOperationException ex)
            {
                return WriteFailure(id, "SOURCE_FIELD_READ_ONLY", ex.Message);
            }
            catch (JsonException ex)
            {
                return WriteFailure(id, "INVALID_PROGRAM", ex.Message);
            }

            var previousData = action.Data;
            var previousData2 = action.Data2;
            var previousData3 = action.Data3;
            var previousType = action.ActionType;
            var previousEditTime = action.LastEditTimeUtc;
            action.Data = nativeJson;
            action.Data2 = string.Empty;
            action.Data3 = string.Empty;
            action.ActionType = ActionType.XAction;
            var saved = false;
            try
            {
                saved = QuickerInternalAccess.TrySaveEditingAction(action, out var saveError);
                if (!saved)
                {
                    return WriteFailure(id, "SOURCE_SAVE_FAILED", saveError ?? "Action save failed.");
                }
            }
            finally
            {
                if (!saved)
                {
                    action.Data = previousData;
                    action.Data2 = previousData2;
                    action.Data3 = previousData3;
                    action.ActionType = previousType;
                    action.LastEditTimeUtc = previousEditTime;
                }
            }

            ActionSearchIndexInvalidator.InvalidateAction();
            DataServiceActionAccess.TryGetById(id, out var reloaded, out _);
            return new QuickerRpcApplyXActionResult
            {
                Success = true,
                ActionId = action.Id,
                EditVersion = ActionDesignerProgramAccess.GetEditVersionMs(reloaded ?? action),
                UpdatedUtc = DateTimeOffset.UtcNow.ToString("o"),
            };
        }
        catch (Exception ex)
        {
            return WriteFailure(id, "SOURCE_SAVE_FAILED", ex.Message);
        }
    }

    private static bool TryReadCatalogBody(ActionItem action, string id, out JObject? body, out string? error)
    {
        body = null;
        error = null;
        string? json = action.Data;
        if (DataServiceActionAccess.TryFindActionWithPayload(id, out var full) && full is not null)
        {
            json = full.Data;
        }

        if (!ActionProgramContent.IsXActionBody(json)
            && !SharedActionProgramAccessor.TryGetFromSharedCache(action, id, out json, out error))
        {
            if (string.IsNullOrWhiteSpace(action.Data))
            {
                body = NativeActionProgramSourceBody.Parse(ActionProgramContent.EmptyBodyJson);
                return true;
            }

            return false;
        }

        body = NativeActionProgramSourceBody.Parse(json!);
        return true;
    }

    private static void EnsureArray(JObject body, string camel, string pascal)
    {
        var value = body[camel] ?? body[pascal];
        if (value is null || value.Type == JTokenType.Null)
        {
            body[body.Property(pascal) is not null ? pascal : camel] = new JArray();
        }
        else if (value is not JArray)
        {
            throw new JsonException(camel + " must be an array.");
        }

        RejectAmbiguousProperty(body, camel, pascal);
    }

    private static void RejectAmbiguousProperty(JObject body, string camel, string pascal)
    {
        if (body.Property(camel) is not null && body.Property(pascal) is not null)
        {
            throw new JsonException("Native program contains both " + camel + " and " + pascal + ".");
        }
    }

    private static QuickerRpcGetActionProgramSourceResult ReadFailure(string id, string code, string message) =>
        new() { ActionId = id, ErrorCode = code, ErrorMessage = message };

    private static QuickerRpcApplyXActionResult WriteFailure(string id, string code, string message) =>
        new() { ActionId = id, ErrorCode = code, ErrorMessage = message };
}
