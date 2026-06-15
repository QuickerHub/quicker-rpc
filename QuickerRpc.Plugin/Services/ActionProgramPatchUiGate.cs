using System;
using System.Windows;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// UI-thread segments for patch/replace when RPC runs on a worker thread.
/// WPF <see cref="Window"/> handles must not be used off their dispatcher.
/// </summary>
internal static class ActionProgramPatchUiGate
{
    internal sealed class DesignerExportResult
    {
        public bool DesignerFound { get; init; }

        public bool DesignerNotLoaded { get; init; }

        public string? PayloadJson { get; init; }

        public string? Error { get; init; }
    }

    internal sealed class DesignerApplyResult
    {
        public bool Success { get; init; }

        public string? Error { get; init; }

        public string? EntityId { get; init; }
    }

    public static DesignerExportResult? TryExportProgramJson(string entityId, bool isSubProgram)
    {
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return null;
        }

        return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => ExportProgramJsonCore(entityId.Trim(), isSubProgram));
    }

    public static DesignerExportResult? TryExportSubProgramJson(string subProgramKey)
    {
        if (string.IsNullOrWhiteSpace(subProgramKey))
        {
            return null;
        }

        return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
        {
            var key = subProgramKey.Trim();
            foreach (var isSubProgram in new[] { true, false })
            {
                var export = ExportProgramJsonCore(key, isSubProgram);
                if (export is not null)
                {
                    return export;
                }
            }

            return null;
        });
    }

    public static DesignerApplyResult ApplyProgramToOpenDesigner(
        string entityId,
        bool isSubProgram,
        XAction? xActionForDesigner,
        string? titleOrName,
        string? description,
        string? icon,
        string? contextMenuData)
    {
        if (string.IsNullOrWhiteSpace(entityId)
            || (xActionForDesigner is null
                && titleOrName is null
                && description is null
                && icon is null
                && contextMenuData is null))
        {
            return new DesignerApplyResult { Success = false, Error = "Designer entity or patch payload is empty." };
        }

        return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
            ApplyProgramToOpenDesignerCore(entityId.Trim(), isSubProgram, xActionForDesigner, titleOrName, description, icon, contextMenuData))
            ?? new DesignerApplyResult { Success = false, Error = "WPF dispatcher unavailable." };
    }

    public static DesignerApplyResult ApplyProgramToOpenSubProgramDesigner(
        string subProgramKey,
        XAction? xActionForDesigner,
        string? titleOrName,
        string? description,
        string? icon)
    {
        if (string.IsNullOrWhiteSpace(subProgramKey)
            || (xActionForDesigner is null && titleOrName is null && description is null && icon is null))
        {
            return new DesignerApplyResult { Success = false, Error = "Designer entity or patch payload is empty." };
        }

        return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
        {
            var key = subProgramKey.Trim();
            foreach (var isSubProgram in new[] { true, false })
            {
                var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(key, isSubProgram);
                if (designer is null)
                {
                    continue;
                }

                return ApplyProgramToOpenDesignerCore(key, isSubProgram, xActionForDesigner, titleOrName, description, icon, contextMenuData: null);
            }

            return new DesignerApplyResult { Success = false, Error = "Subprogram designer window not found." };
        }) ?? new DesignerApplyResult { Success = false, Error = "WPF dispatcher unavailable." };
    }

    private static DesignerExportResult? ExportProgramJsonCore(string entityId, bool isSubProgram)
    {
        var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(entityId, isSubProgram);
        if (designer is null)
        {
            return null;
        }

        ActionDesignerUiSave.WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            return new DesignerExportResult { DesignerFound = true, DesignerNotLoaded = true };
        }

        if (!ActionDesignerContext.TryExportXActionJson(designer, out var payloadJson, out var exportError)
            || string.IsNullOrWhiteSpace(payloadJson))
        {
            return new DesignerExportResult
            {
                DesignerFound = true,
                Error = exportError ?? "Designer export failed.",
            };
        }

        return new DesignerExportResult { DesignerFound = true, PayloadJson = payloadJson };
    }

    private static DesignerApplyResult ApplyProgramToOpenDesignerCore(
        string entityId,
        bool isSubProgram,
        XAction? xActionForDesigner,
        string? titleOrName,
        string? description,
        string? icon,
        string? contextMenuData)
    {
        var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(entityId, isSubProgram);
        if (designer is null)
        {
            return new DesignerApplyResult { Success = false, Error = "Designer window not found." };
        }

        ActionDesignerUiSave.WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            return new DesignerApplyResult { Success = false, Error = "Action Designer is not loaded." };
        }

        if (xActionForDesigner is not null)
        {
            if (!ActionDesignerUiSave.TrySyncDesignerMemory(designer, xActionForDesigner))
            {
                return new DesignerApplyResult { Success = false, Error = "Failed to apply patch to open Action Designer." };
            }
        }
        else if (titleOrName is null && description is null && icon is null && contextMenuData is null)
        {
            return new DesignerApplyResult { Success = false, Error = "Nothing to apply to open Action Designer." };
        }

        if (titleOrName is not null
            || description is not null
            || icon is not null
            || contextMenuData is not null)
        {
            if (!ActionDesignerUiSave.TrySyncDesignerPresentation(
                    designer,
                    isSubProgram,
                    titleOrName,
                    description,
                    icon,
                    contextMenuData,
                    out var presentationError))
            {
                return new DesignerApplyResult
                {
                    Success = false,
                    Error = presentationError ?? "Failed to apply presentation to open Action Designer.",
                };
            }
        }

        var resolvedEntityId = ActionDesignerContext.TryReadDesignerEntityId(designer) ?? entityId;
        return new DesignerApplyResult { Success = true, EntityId = resolvedEntityId };
    }

    /// <summary>
    /// After workspace apply/replace persisted to catalog, refresh open Action Designer if present.
    /// Best-effort: returns false when no matching designer window is open.
    /// </summary>
    public static bool TryRefreshOpenDesignerProgram(
        string entityId,
        bool isSubProgram,
        JArray steps,
        JArray variables,
        string? subProgramsJson = null)
    {
        try
        {
            return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
                TryRefreshOpenDesignerProgramCore(entityId, isSubProgram, steps, variables, subProgramsJson));
        }
        catch
        {
            // Designer refresh is best-effort; catalog apply already succeeded.
            return false;
        }
    }

    private static bool TryRefreshOpenDesignerProgramCore(
        string entityId,
        bool isSubProgram,
        JArray steps,
        JArray variables,
        string? subProgramsJson)
    {
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return false;
        }

        var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(entityId.Trim(), isSubProgram);
        if (designer is null)
        {
            return false;
        }

        var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(
            existingData: null,
            steps,
            variables,
            subProgramsJson ?? "[]");
        var xActionForDesigner = XActionProgramBodyWriter.DeserializeXAction(bodyJson);
        var applyUi = ApplyProgramToOpenDesigner(
            entityId,
            isSubProgram,
            xActionForDesigner,
            titleOrName: null,
            description: null,
            icon: null,
            contextMenuData: null);
        return applyUi.Success;
    }
}
