using System;
using Quicker.Utilities;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Clipboard writes via Quicker <see cref="ClipboardHelper"/> (secondary STA dispatcher + WinForms API).
/// Avoids OpenClipboard failures when the main WPF dispatcher or DataGrid still holds the clipboard.
/// </summary>
internal static class ClipboardSta
{
    public static bool TrySetText(string text, out string? errorMessage, Action? onSuccess = null)
    {
        errorMessage = null;
        if (string.IsNullOrEmpty(text))
        {
            errorMessage = "要复制的内容为空。";
            return false;
        }

        try
        {
            if (!ClipboardHelper.SetText(text))
            {
                errorMessage = "复制到剪贴板失败（剪贴板可能被其它程序占用）。";
                return false;
            }

            onSuccess?.Invoke();
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }
}
