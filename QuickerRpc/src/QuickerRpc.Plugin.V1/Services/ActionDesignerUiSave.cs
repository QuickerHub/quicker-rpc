using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Newtonsoft.Json;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// When <c>ActionDesignerWindow</c> is already open, apply <see cref="XAction"/> to the designer UI.
/// QuickerPc source: set <c>Action</c>, call <c>UpdateXActionUi</c>, sync <c>ResultActionItem.Data</c>
/// (see <c>.ref/Quicker/QuickerPc/Quicker/View/X/ActionDesignerWindow.xaml.cs</c> SaveAllData / DoSaveWithoutClose).
/// </summary>
internal static class ActionDesignerUiSave
{
    private const string DesignerWindowTypeFullName = "Quicker.View.X.ActionDesignerWindow";

    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    public static void PumpDispatcherOnce()
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return;
        }

        var frame = new DispatcherFrame();
        _ = dispatcher.BeginInvoke(
            DispatcherPriority.Background,
            new DispatcherOperationCallback(static o =>
            {
                ((DispatcherFrame)o!).Continue = false;
                return null;
            }),
            frame);
        Dispatcher.PushFrame(frame);
    }

    public static bool DesignerEntityIdsMatch(string? a, string? b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b))
        {
            return false;
        }

        var ta = a.Trim();
        var tb = b.Trim();
        if (string.Equals(ta, tb, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return Guid.TryParse(ta, out var ga) && Guid.TryParse(tb, out var gb) && ga == gb;
    }

    public static Window? TryFindActionDesignerWindow(string entityId, bool isSubProgram) =>
        ScanAppWindowsForActionDesignerWindow(entityId, isSubProgram, requireLoaded: false);

    public static Window? ScanAppWindowsForActionDesignerWindow(
        string entityId,
        bool isSubProgram,
        bool requireLoaded)
    {
        if (string.IsNullOrWhiteSpace(entityId) || Application.Current?.Windows is null)
        {
            return null;
        }

        var want = entityId.Trim();
        foreach (Window w in Application.Current.Windows)
        {
            if (requireLoaded && !w.IsLoaded)
            {
                continue;
            }

            if (!string.Equals(w.GetType().FullName, DesignerWindowTypeFullName, StringComparison.Ordinal))
            {
                continue;
            }

            var t = w.GetType();
            var isSpProp = t.GetProperty("IsSubProgram", InstanceAll);
            var winIsSubProgram = isSpProp?.GetValue(w) is bool b && b;
            if (winIsSubProgram != isSubProgram)
            {
                continue;
            }

            var winId = TryGetDesignerEntityId(w, t);
            if (DesignerEntityIdsMatch(winId, want))
            {
                return w;
            }
        }

        return null;
    }

    public static void WaitUntilDesignerLoaded(Window designer, int maxAttempts = 300, int sleepMs = 10)
    {
        _ = sleepMs;
        if (designer is null || designer.IsLoaded)
        {
            return;
        }

        var dispatcher = designer.Dispatcher ?? Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return;
        }

        if (!dispatcher.CheckAccess())
        {
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => WaitUntilDesignerLoaded(designer, maxAttempts));
            return;
        }

        for (var a = 0; a < maxAttempts && !designer.IsLoaded; a++)
        {
            PumpDispatcherOnce();
        }
    }

    /// <summary>Update title/description/icon on open designer without persisting to catalog.</summary>
    public static bool TrySyncDesignerPresentation(
        Window designerWindow,
        bool isSubProgram,
        string? titleOrName,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        error = null;
        if (designerWindow is null)
        {
            error = "Designer window is required.";
            return false;
        }

        try
        {
            var winType = designerWindow.GetType();
            var appliedAny = false;
            foreach (var name in new[] { "EditingActionItem", "ResultActionItem", "EditingActionItem2", "ResultActionItem2" })
            {
                var item = winType.GetProperty(name, InstanceAll)?.GetValue(designerWindow);
                if (item is null)
                {
                    continue;
                }

                if (!DesignerEntityPresentation.TryApply(
                        item,
                        isSubProgram,
                        titleOrName,
                        description,
                        icon,
                        contextMenuData,
                        out error))
                {
                    return false;
                }

                appliedAny = true;
            }

            if (!appliedAny)
            {
                error = "Designer editing item not found.";
                return false;
            }

            if (titleOrName is not null)
            {
                var trimmed = titleOrName.Trim();
                if (trimmed.Length > 0)
                {
                    designerWindow.Title = trimmed;
                }
            }

            QuickerActionDesignerReflection.TryInvokeUpdateXActionUi(designerWindow, out _);
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TrySyncDesignerPresentation failed: {0}", ex.Message);
            error = ex.Message;
            return false;
        }
    }

    /// <summary>Read the action text label from <c>ActionUIEditor.TxtActionTitle</c>.</summary>
    internal static bool TryReadDesignerActionTitleText(Window designerWindow, out string? title)
    {
        title = null;
        if (designerWindow is null)
        {
            return false;
        }

        try
        {
            var uiEditor = designerWindow.GetType().GetField("UiEditor", InstanceAll)?.GetValue(designerWindow);
            if (uiEditor is null)
            {
                return false;
            }

            var editorType = uiEditor.GetType();
            if (editorType.GetField("TxtActionTitle", InstanceAll)?.GetValue(uiEditor) is TextBox titleBox)
            {
                title = titleBox.Text;
                return true;
            }

            if (editorType.GetProperty("ActionTitle", InstanceAll)?.GetValue(uiEditor) is string actionTitle)
            {
                title = actionTitle;
                return true;
            }
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryReadDesignerActionTitleText failed: {0}", ex.Message);
        }

        return false;
    }

    /// <summary>
    /// Write the action text label into <c>ActionUIEditor</c> (same surface Ctrl+S reads via SaveAllData).
    /// </summary>
    internal static bool TrySetDesignerActionTitleText(Window designerWindow, string title, out string? error)
    {
        error = null;
        var trimmed = (title ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            error = "title cannot be empty.";
            return false;
        }

        try
        {
            var winType = designerWindow.GetType();
            ActionDesignerContext.TryReadDesignerPresentation(
                designerWindow,
                out _,
                out var description,
                out var icon,
                out _);

            var uiEditor = winType.GetField("UiEditor", InstanceAll)?.GetValue(designerWindow);
            if (uiEditor is null)
            {
                error = "ActionUIEditor not found on designer.";
                return false;
            }

            var editorType = uiEditor.GetType();
            var setUiData = editorType.GetMethod(
                "SetUiData",
                InstanceAll,
                binder: null,
                types: new[] { typeof(string), typeof(string), typeof(string) },
                modifiers: null);
            if (setUiData is not null)
            {
                setUiData.Invoke(uiEditor, new object?[] { trimmed, description ?? string.Empty, icon ?? string.Empty });
            }
            else if (editorType.GetField("TxtActionTitle", InstanceAll)?.GetValue(uiEditor) is TextBox titleBox)
            {
                titleBox.Text = trimmed;
            }
            else
            {
                error = "ActionUIEditor title field not found.";
                return false;
            }

            var saveToAction = editorType.GetMethod("SaveToAction", InstanceAll);
            if (saveToAction is not null)
            {
                foreach (var itemName in new[] { "EditingActionItem", "ResultActionItem", "EditingActionItem2", "ResultActionItem2" })
                {
                    var item = winType.GetProperty(itemName, InstanceAll)?.GetValue(designerWindow);
                    if (item is not null)
                    {
                        saveToAction.Invoke(uiEditor, new[] { item });
                    }
                }
            }

            foreach (var itemName in new[] { "EditingActionItem", "ResultActionItem", "EditingActionItem2", "ResultActionItem2" })
            {
                var item = winType.GetProperty(itemName, InstanceAll)?.GetValue(designerWindow);
                if (item is null)
                {
                    continue;
                }

                DesignerEntityPresentation.TryApply(
                    item,
                    isSubProgram: false,
                    trimmed,
                    description: null,
                    icon: null,
                    contextMenuData: null,
                    out _);
            }

            designerWindow.Title = trimmed;
            QuickerActionDesignerReflection.TryInvokeUpdateXActionUi(designerWindow, out _);
            PumpDispatcherOnce();

            if (TryReadDesignerActionTitleText(designerWindow, out var verifyTitle)
                && !string.IsNullOrWhiteSpace(verifyTitle)
                && string.Equals(verifyTitle.Trim(), trimmed, StringComparison.Ordinal))
            {
                return true;
            }

            if (TryReadDesignerActionTitleText(designerWindow, out verifyTitle)
                && ActionDesignerTempTitle.NeedsTempTitle(verifyTitle))
            {
                error = "Action text label was not applied to the designer UI.";
                return false;
            }

            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TrySetDesignerActionTitleText failed: {0}", ex.Message);
            error = ex.Message;
            return false;
        }
    }

    /// <summary>Push patched XAction into open designer UI without persisting to catalog.</summary>
    public static bool TrySyncDesignerMemory(Window designerWindow, XAction action) =>
        TryApplyImportedXActionToOpenDesigner(designerWindow, action, out _);

    /// <summary>
    /// Apply imported program: ReplaceActionContent + stable-surface UI refresh (Release-safe).
    /// </summary>
    public static bool TryApplyImportedXActionToOpenDesigner(
        Window designerWindow,
        XAction imported,
        out string? error)
    {
        error = null;
        if (designerWindow is null || imported is null)
        {
            error = "Designer or XAction is null.";
            return false;
        }

        var stepCount = imported.Steps?.Count ?? 0;
        var variableCount = imported.Variables?.Count ?? 0;
        if (stepCount == 0 && variableCount == 0)
        {
            error = "Imported action has no steps or variables.";
            return false;
        }

        try
        {
            ActionDesignerReflection.TryUnlockReadOnly(designerWindow, out _, out _);

            if (!ActionDesignerCurrentActionAccess.TrySetActionDefinition(designerWindow, imported, out error))
            {
                error ??= "Failed to apply XAction to designer.";
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryApplyImportedXActionToOpenDesigner failed: {0}", ex.Message);
            error = ex.Message;
            return false;
        }
    }

    public static bool TryApplyXActionToOpenDesigner(Window designerWindow, XAction action) =>
        TryApplyImportedXActionToOpenDesigner(designerWindow, action, out _);

    internal static void TrySyncResultItemAfterPaste(Window designerWindow) =>
        SyncResultItemFromDesignerAction(designerWindow);

    private static void SyncResultItemFromDesignerAction(Window designerWindow)
    {
        if (ActionDesignerReflection.TryGetActionProperty(designerWindow, out var xActionObj)
            && xActionObj is XAction xAction)
        {
            TryUpdateDesignerResultItem(designerWindow, xAction);
        }
    }

    /// <summary>
    /// If subprogram Action Designer is open, run <c>SaveAllData</c> + <c>DoSaveWithoutClose</c>
    /// (same as clicking Save in ActionDesignerWindow).
    /// </summary>
    public static bool TryPersistOpenSubProgramDesignerOnUiThread(string subProgramId, XAction xAction, out string? error) =>
        TryPersistOpenDesignerOnUiThread(subProgramId, xAction, isSubProgram: true, out error);

    public static bool TryPersistOpenActionDesignerOnUiThread(string actionId, XAction xAction, out string? error) =>
        TryPersistOpenDesignerOnUiThread(actionId, xAction, isSubProgram: false, out error);

    /// <summary>
    /// Save in-memory designer state to catalog without pushing an external <see cref="XAction"/> payload first.
    /// </summary>
    public static bool TryPersistOpenActionDesignerInPlaceOnUiThread(string actionId, out string? error) =>
        TryPersistOpenDesignerInPlaceOnUiThread(actionId, isSubProgram: false, out error);

    public static bool TryPersistOpenSubProgramDesignerInPlaceOnUiThread(string subProgramId, out string? error) =>
        TryPersistOpenDesignerInPlaceOnUiThread(subProgramId, isSubProgram: true, out error);

    public static bool TryPersistDesignerWindowInPlaceOnUiThread(Window designer, out string? error)
    {
        error = null;
        if (designer is null)
        {
            return false;
        }

        (bool ok, string? err)? outcome = QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
            TryPersistDesignerWindowInPlace(designer, out var localError)
                ? ((bool ok, string? err)?)(ok: true, err: null)
                : ((bool ok, string? err)?)(ok: false, err: localError));

        if (outcome is null)
        {
            error = "WPF dispatcher unavailable.";
            return false;
        }

        error = outcome.Value.err;
        return outcome.Value.ok;
    }

    private static bool TryPersistOpenDesignerInPlaceOnUiThread(
        string entityId,
        bool isSubProgram,
        out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(entityId))
        {
            return false;
        }

        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return false;
        }

        var persisted = false;
        string? localError = null;
        dispatcher.Invoke(() =>
        {
            var designer = TryFindActionDesignerWindow(entityId.Trim(), isSubProgram);
            if (designer is null)
            {
                return;
            }

            persisted = TryPersistDesignerWindowInPlace(designer, out localError);
        });

        for (var i = 0; i < 120; i++)
        {
            PumpDispatcherOnce();
        }

        error = localError;
        return persisted;
    }

    private static bool TryPersistOpenDesignerOnUiThread(
        string entityId,
        XAction xAction,
        bool isSubProgram,
        out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(entityId) || xAction is null)
        {
            return false;
        }

        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return false;
        }

        var persisted = false;
        string? localError = null;
        dispatcher.Invoke(() =>
        {
            persisted = TryPersistOpenDesigner(entityId.Trim(), xAction, isSubProgram, out localError);
        });

        for (var i = 0; i < 120; i++)
        {
            PumpDispatcherOnce();
        }

        error = localError;
        return persisted;
    }

    private static bool TryPersistOpenDesigner(
        string entityId,
        XAction xAction,
        bool isSubProgram,
        out string? error)
    {
        error = null;
        var designer = TryFindActionDesignerWindow(entityId, isSubProgram);
        if (designer is null)
        {
            return false;
        }

        WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            error = "Action Designer is not loaded.";
            return false;
        }

        if (!TryApplyXActionToOpenDesigner(designer, xAction))
        {
            error = "Failed to apply XAction to open Action Designer.";
            return false;
        }

        TryUpdateDesignerResultItem(designer, xAction);
        return TryInvokeDesignerCatalogSave(designer, out error);
    }

    internal static bool TryPersistDesignerWindowInPlace(Window designer, out string? error)
    {
        error = null;
        WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            error = "Action Designer is not loaded.";
            return false;
        }

        return TryInvokeDesignerCatalogSave(designer, out error);
    }

    /// <summary>
    /// Ctrl+S equivalent: temp title (if needed) + <c>DoSaveWithoutClose</c>, keep the designer open.
    /// </summary>
    public static bool TrySaveOpenDesignerWithoutClose(Window designer, out string? appliedTempTitle, out string? error)
    {
        appliedTempTitle = null;
        if (!ActionDesignerContext.IsSubProgramDesigner(designer)
            && !ActionDesignerTempTitle.TryEnsureOnDesigner(designer, out appliedTempTitle, out error))
        {
            return false;
        }

        if (!TryInvokeDesignerCatalogSave(designer, out error))
        {
            return false;
        }

        if (!designer.IsLoaded)
        {
            error = "Action Designer closed unexpectedly after save.";
            return false;
        }

        return true;
    }

    private static bool TryInvokeDesignerCatalogSave(Window designer, out string? error)
    {
        error = null;

        try
        {
            if (!QuickerActionDesignerReflection.TryInvokeDoSaveWithoutClose(designer, out error))
            {
                error ??= "Action Designer save (Ctrl+S) failed.";
                return false;
            }

            PumpDispatcherOnce();
            if (!designer.IsLoaded)
            {
                error = "Action Designer closed unexpectedly after save.";
                return false;
            }

            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    /// <summary>
    /// If Action Designer is open for this action, push the saved <see cref="XAction"/> into the WPF UI (UI thread).
    /// </summary>
    public static bool TrySyncOpenDesignerOnUiThread(string actionId, XAction xAction) =>
        TrySyncOpenDesignerOnUiThread(actionId, xAction, isSubProgram: false);

    /// <summary>
    /// If subprogram Action Designer is open, push the saved program into the WPF UI (UI thread).
    /// </summary>
    public static bool TrySyncOpenSubProgramDesignerOnUiThread(string subProgramId, XAction xAction) =>
        TrySyncOpenDesignerOnUiThread(subProgramId, xAction, isSubProgram: true);

    private static bool TrySyncOpenDesignerOnUiThread(string entityId, XAction xAction, bool isSubProgram)
    {
        if (string.IsNullOrWhiteSpace(entityId) || xAction is null)
        {
            return false;
        }

        bool? synced = QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
        {
            var result = TrySyncOpenDesigner(entityId.Trim(), xAction, isSubProgram);
            for (var i = 0; i < 8; i++)
            {
                PumpDispatcherOnce();
            }

            return result;
        });

        return synced ?? false;
    }

    private static bool TrySyncOpenDesigner(string entityId, XAction xAction, bool isSubProgram)
    {
        var designer = TryFindActionDesignerWindow(entityId, isSubProgram);
        if (designer is null)
        {
            return false;
        }

        WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            return false;
        }

        if (!TryApplyXActionToOpenDesigner(designer, xAction))
        {
            return false;
        }

        TryUpdateDesignerResultItem(designer, xAction);
        return true;
    }

    /// <summary>
    /// Keep in-memory designer state aligned with persisted body (SaveAllData writes ResultActionItem.Data).
    /// </summary>
    private static void TryUpdateDesignerResultItem(Window designerWindow, XAction xAction)
    {
        if (TryUpdateResultActionItem(designerWindow, xAction))
        {
            return;
        }

        TryUpdateResultActionItem2(designerWindow, xAction);
    }

    private static bool TryUpdateResultActionItem(Window designerWindow, XAction xAction)
    {
        try
        {
            var winType = designerWindow.GetType();
            var result = winType.GetProperty("ResultActionItem", InstanceAll)?.GetValue(designerWindow);
            if (result is null)
            {
                return false;
            }

            var dataProp = result.GetType().GetProperty("Data", InstanceAll);
            if (dataProp is null || !dataProp.CanWrite)
            {
                return false;
            }

            dataProp.SetValue(result, JsonConvert.SerializeObject(xAction));
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryUpdateResultActionItem failed: {0}", ex.Message);
            return false;
        }
    }

    private static void TryUpdateResultActionItem2(Window designerWindow, XAction xAction)
    {
        try
        {
            var winType = designerWindow.GetType();
            var resultProp = winType.GetProperty("ResultActionItem2", InstanceAll);
            var result = resultProp?.GetValue(designerWindow);
            if (result is null)
            {
                return;
            }

            var resultType = result.GetType();
            var opTypes = resultType.Assembly.GetType("Quicker.Common.V2.OperationTypes", false);
            var op = opTypes?.GetField("XACTION", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null) as string ?? "xaction";
            resultType.GetProperty("OperationType", InstanceAll)?.SetValue(result, op);

            var dtoType = resultType.Assembly.GetType("Quicker.Common.ActionPayloads.XAction.XActionDto", false);
            if (dtoType is null)
            {
                return;
            }

            var payload = JsonConvert.DeserializeObject(
                JsonConvert.SerializeObject(xAction),
                dtoType);
            resultType.GetProperty("OperationPayload", InstanceAll)?.SetValue(result, payload);
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryUpdateResultActionItem2 failed: {0}", ex.Message);
        }
    }

    public static bool TryTriggerPrimarySaveClick(Window designerWindow)
    {
        if (designerWindow is null)
        {
            return false;
        }

        var btn = TryFindPrimarySaveButton(designerWindow);
        if (btn is null || !btn.IsEnabled)
        {
            return false;
        }

        try
        {
            btn.RaiseEvent(new RoutedEventArgs(Button.ClickEvent, btn));
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TriggerClick save failed: {0}", ex.Message);
            return false;
        }
    }

    private static Button? TryFindPrimarySaveButton(Window designerWindow)
    {
        if (designerWindow.FindName("BtnSave") is Button rootSave)
        {
            return rootSave;
        }

        if (designerWindow.FindName("ActionEditor") is FrameworkElement editor &&
            editor.FindName("SaveDialogButtonControl") is Button editorSave)
        {
            return editorSave;
        }

        return null;
    }

    private static string? TryGetDesignerEntityId(Window w, Type designerType)
    {
        try
        {
            if (w.Tag is string tagStr && !string.IsNullOrWhiteSpace(tagStr))
            {
                return tagStr.Trim();
            }

            if (w.Tag != null)
            {
                var ts = w.Tag.ToString()?.Trim();
                if (!string.IsNullOrEmpty(ts))
                {
                    return ts;
                }
            }

            var editing = designerType.GetProperty("EditingActionItem2", InstanceAll)?.GetValue(w)
                ?? designerType.GetProperty("EditingActionItem", InstanceAll)?.GetValue(w);
            if (editing is null)
            {
                return null;
            }

            var editingType = editing.GetType();
            var idValue = editingType.GetProperty("Id", InstanceAll)?.GetValue(editing);
            return idValue switch
            {
                string s => s,
                Guid g => g.ToString("D"),
                _ => idValue?.ToString(),
            };
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryGetDesignerEntityId failed: {0}", ex.Message);
            return null;
        }
    }
}
