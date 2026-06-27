using System;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Windows;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write helpers for an open <c>ActionDesignerWindow</c> (in-process, UI thread).
/// </summary>
internal static class ActionDesignerContext
{
    private static readonly JsonSerializerSettings ExportJson = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
    };

    public static Window? TryGetForegroundDesigner()
    {
        var active = Application.Current?.Windows
            .OfType<Window>()
            .FirstOrDefault(w => w.IsActive && ActionDesignerReflection.IsDesignerWindow(w));
        if (active is not null)
        {
            return active;
        }

        return Application.Current?.Windows
            .OfType<Window>()
            .FirstOrDefault(ActionDesignerReflection.IsDesignerWindow);
    }

    public static bool TryExportXActionJson(Window designer, out string? json, out string? error)
    {
        json = null;
        error = null;
        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var xAction) || xAction is null)
        {
            error = "Designer Action is not available.";
            return false;
        }

        try
        {
            json = JsonConvert.SerializeObject(xAction, ExportJson);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryExportCompressedXActionJson(Window designer, out string? json, out string? error)
    {
        json = null;
        error = null;
        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var xActionObj) || xActionObj is null)
        {
            error = "Designer Action is not available.";
            return false;
        }

        try
        {
            var body = JObject.Parse(JsonConvert.SerializeObject(xActionObj));
            var (steps, variables, subPrograms) = ActionProgramContent.ReadBodyArrays(body);
            XActionProgramService.EnsureEphemeralIds(steps, variables);

            var catalog = StepRunnerCatalogFromQuicker.Build();
            var compressedRoot = XActionProgramService.Compress(
                XActionGetReturnMode.Full,
                steps,
                variables,
                catalog,
                omitDefaultLiteralInputs: true);

            if (subPrograms.Count > 0)
            {
                compressedRoot["subPrograms"] = ActionEmbeddedSubProgramWire.CompressFromNative(
                    subPrograms,
                    catalog,
                    omitDefaultLiteralInputs: true);
            }

            var actionId = TryReadDesignerEntityId(designer);
            if (!string.IsNullOrWhiteSpace(actionId))
            {
                compressedRoot["actionId"] = actionId.Trim();
            }

            compressedRoot["returnMode"] = XActionGetReturnModeParser.ToWire(XActionGetReturnMode.Full);
            compressedRoot["omitDefaultLiteralInputsApplied"] = true;
            compressedRoot["subProgramCount"] = subPrograms.Count;

            json = JTokenCompat.Format(compressedRoot, Formatting.Indented);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryImportXActionJson(Window designer, string json, out string? error) =>
        ActionDesignerCurrentActionAccess.TrySetActionDefinition(designer, json, out error);

    public static bool TryCopyActionId(Window designer, out string? actionId, out string? error)
    {
        actionId = null;
        error = null;
        var id = TryReadDesignerEntityId(designer);
        if (string.IsNullOrWhiteSpace(id))
        {
            error = "Action id not found on designer.";
            return false;
        }

        actionId = id.Trim();
        return true;
    }

    public static string? TryReadDesignerEntityId(Window designer)
    {
        if (designer is null)
        {
            return null;
        }

        try
        {
            var winType = designer.GetType();
            var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            if (designer.Tag is string tagStr && !string.IsNullOrWhiteSpace(tagStr))
            {
                return tagStr.Trim();
            }

            var editing = winType.GetProperty("EditingActionItem2", flags)?.GetValue(designer)
                ?? winType.GetProperty("EditingActionItem", flags)?.GetValue(designer);
            if (editing is null)
            {
                return null;
            }

            var editingType = editing.GetType();
            var idValue = editingType.GetProperty("Id", flags)?.GetValue(editing);
            return idValue switch
            {
                string s => s,
                Guid g => g.ToString("D"),
                _ => idValue?.ToString(),
            };
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryReadDesignerEntityId failed: {0}", ex.Message);
            return null;
        }
    }

    public static void TryReadDesignerPresentation(
        Window designer,
        out string? title,
        out string? description,
        out string? icon,
        out string? contextMenuData)
    {
        title = null;
        description = null;
        icon = null;
        contextMenuData = null;
        try
        {
            var winType = designer.GetType();
            var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            var editing = winType.GetProperty("EditingActionItem2", flags)?.GetValue(designer)
                ?? winType.GetProperty("EditingActionItem", flags)?.GetValue(designer);
            if (editing is null)
            {
                title = designer.Title;
                return;
            }

            var editingType = editing.GetType();
            title = editingType.GetProperty("Title", flags)?.GetValue(editing) as string ?? designer.Title;
            description = editingType.GetProperty("Description", flags)?.GetValue(editing) as string;
            icon = editingType.GetProperty("Icon", flags)?.GetValue(editing) as string;
            contextMenuData = editingType.GetProperty("ContextMenuData", flags)?.GetValue(editing) as string;
        }
        catch
        {
            title = designer.Title;
        }
    }

    public static bool TryCopySelectedVariableKeys(Window designer, out string text, out string? error)
    {
        text = string.Empty;
        error = null;
        if (!ActionDesignerReflection.TryGetSelectedVariableKeys(designer, out var keys) || keys.Length == 0)
        {
            error = "No variables selected.";
            return false;
        }

        text = string.Join(Environment.NewLine, keys);
        return true;
    }

    /// <summary>
    /// Persist an open Action Designer window to the Quicker catalog (<c>DoSaveWithoutClose</c>, same as Ctrl+S).
    /// Returns false with a null <paramref name="error"/> when no designer window matches <paramref name="entityId"/>.
    /// </summary>
    public static bool TryCatalogSaveOpenDesigner(string entityId, bool isSubProgram, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return false;
        }

        (bool found, bool ok, string? err)? outcome = QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
        {
            var designer = ActionDesignerUiSave.TryFindActionDesignerWindow(entityId.Trim(), isSubProgram);
            if (designer is null)
            {
                return ((bool found, bool ok, string? err)?)(found: false, ok: false, err: null);
            }

            if (!isSubProgram
                && !ActionDesignerTempTitle.TryEnsureOnDesigner(designer, out _, out var tempError))
            {
                return ((bool found, bool ok, string? err)?)(found: true, ok: false, err: tempError);
            }

            var ok = ActionDesignerUiSave.TryPersistDesignerWindowInPlace(designer, out var err);
            return ((bool found, bool ok, string? err)?)(found: true, ok: ok, err: err);
        });

        if (outcome is null)
        {
            error = "WPF dispatcher unavailable.";
            return false;
        }

        if (!outcome.Value.found)
        {
            error = null;
            return false;
        }

        error = outcome.Value.err;
        return outcome.Value.ok;
    }

    /// <summary>
    /// Manual test (QuickerRpc tools tab): temp title + Ctrl+S save + catalog verify; designer stays open.
    /// </summary>
    public static bool TryTestCatalogSave(Window designer, out string summary, out string? error)
    {
        summary = string.Empty;
        error = null;
        var entityId = TryReadDesignerEntityId(designer);
        if (string.IsNullOrWhiteSpace(entityId))
        {
            error = "Action id not found.";
            return false;
        }

        var id = entityId.Trim();
        if (!ActionDesignerUiSave.TrySaveOpenDesignerWithoutClose(designer, out var tempTitle, out error))
        {
            return false;
        }

        if (!DataServiceActionAccess.TryGetById(id, out var action, out _) || action is null)
        {
            error = "Designer saved but action was not found in Quicker catalog.";
            return false;
        }

        var title = (action.Title ?? string.Empty).Trim();
        summary = string.IsNullOrWhiteSpace(tempTitle)
            ? $"入库成功（窗口未关闭）：{title} ({id})"
            : $"入库成功（临时标题 {tempTitle}，窗口未关闭）：{title} ({id})";
        return true;
    }

    public static bool TrySave(Window designer, out string? error)
    {
        error = null;
        if (TryReadDesignerEntityId(designer) is not { Length: > 0 })
        {
            error = "Action id not found.";
            return false;
        }

        return ActionDesignerUiSave.TrySaveOpenDesignerWithoutClose(designer, out _, out error);
    }

    internal static bool IsSubProgramDesigner(Window designer)
    {
        try
        {
            var prop = designer.GetType().GetProperty(
                "IsSubProgram",
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            return prop?.GetValue(designer) is bool b && b;
        }
        catch
        {
            return false;
        }
    }
}
