using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace QuickerRpc.Plugin.Services;

/// <summary>Clipboard writes on Quicker's STA UI dispatcher (required for OpenClipboard).</summary>
internal static class ClipboardSta
{
    public static bool TrySetText(string text, out string? errorMessage, Action? onSuccess = null)
    {
        errorMessage = null;
        var dispatcher = QuickerDispatcherInvoke.AppDispatcher;
        if (dispatcher is null)
        {
            errorMessage = "WPF dispatcher unavailable.";
            return false;
        }

        var success = false;
        Exception? failure = null;

        void CopyCore()
        {
            try
            {
                SetTextWithRetry(text);
                onSuccess?.Invoke();
                success = true;
            }
            catch (Exception ex)
            {
                failure = ex;
            }
        }

        // Context menu may still own the clipboard; wait until idle on the UI thread.
        var priority = dispatcher.CheckAccess()
            ? DispatcherPriority.ApplicationIdle
            : DispatcherPriority.Normal;

        dispatcher.Invoke(CopyCore, priority);

        if (!success)
        {
            errorMessage = failure?.Message ?? "复制到剪贴板失败。";
        }

        return success;
    }

    private static void SetTextWithRetry(string text)
    {
        const int attempts = 10;
        for (var i = 0; i < attempts; i++)
        {
            try
            {
                Clipboard.SetText(text);
                return;
            }
            catch (COMException) when (i < attempts - 1)
            {
                Thread.Sleep(50);
            }
            catch (ExternalException) when (i < attempts - 1)
            {
                Thread.Sleep(50);
            }
        }
    }
}
