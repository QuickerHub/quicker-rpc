using System;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Newtonsoft.Json;
using Quicker.Domain.Actions.X;

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
        if (designer is null)
        {
            return;
        }

        for (var a = 0; a < maxAttempts && !designer.IsLoaded; a++)
        {
            PumpDispatcherOnce();
            Thread.Sleep(sleepMs);
        }
    }

    public static bool TryApplyXActionToOpenDesigner(Window designerWindow, XAction action)
    {
        if (designerWindow is null || action is null)
        {
            return false;
        }

        try
        {
            var winType = designerWindow.GetType();
            winType.GetProperty("Action", InstanceAll)?.SetValue(designerWindow, action);

            var updateUi = winType.GetMethod("UpdateXActionUi", InstanceAll, null, Type.EmptyTypes, null);
            updateUi?.Invoke(designerWindow, null);
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryApplyXActionToOpenDesigner failed: {0}", ex.Message);
            return false;
        }
    }

    /// <summary>
    /// If subprogram Action Designer is open, run <c>SaveAllData</c> + <c>DoSaveWithoutClose</c>
    /// (same as clicking Save in ActionDesignerWindow).
    /// </summary>
    public static bool TryPersistOpenSubProgramDesignerOnUiThread(string subProgramId, XAction xAction, out string? error) =>
        TryPersistOpenDesignerOnUiThread(subProgramId, xAction, isSubProgram: true, out error);

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

        var winType = designer.GetType();
        try
        {
            winType.GetMethod("SaveAllData", InstanceAll)?.Invoke(designer, null);

            var doSave = winType.GetMethod("DoSaveWithoutClose", InstanceAll);
            if (doSave is not null)
            {
                var taskObj = doSave.Invoke(designer, null);
                if (taskObj is Task<bool> boolTask)
                {
                    if (!boolTask.GetAwaiter().GetResult())
                    {
                        error = "DoSaveWithoutClose returned false.";
                        return false;
                    }

                    return true;
                }

                if (taskObj is Task task)
                {
                    task.GetAwaiter().GetResult();
                    return true;
                }
            }

            if (TryTriggerPrimarySaveClick(designer))
            {
                return true;
            }

            error = "Action Designer save entry point not found.";
            return false;
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

        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return false;
        }

        var synced = false;
        dispatcher.Invoke(() => synced = TrySyncOpenDesigner(entityId.Trim(), xAction, isSubProgram));

        for (var i = 0; i < 120; i++)
        {
            PumpDispatcherOnce();
        }

        return synced;
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
