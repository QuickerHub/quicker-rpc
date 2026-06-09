using System;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Windows clipboard access for action-editor custom MIME (matches WPF StepListControl / ConstValues.STEPS_CLIPBOARD_TYPE).
/// </summary>
internal static class ClipboardSpecialFormatService
{
    public static QuickerRpcClipboardSpecialFormatReadResult Read(string? format)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return Fail("QuickerRpc plugin is not running inside Quicker.");
        }

        var fmt = (format ?? string.Empty).Trim();
        if (fmt.Length == 0)
        {
            return Fail("Clipboard format is required.");
        }

        try
        {
            if (!ClipboardHelper.ContainsData(fmt))
            {
                return new QuickerRpcClipboardSpecialFormatReadResult
                {
                    Success = true,
                    HasData = false,
                };
            }

            var raw = ClipboardHelper.GetData(fmt);
            var text = raw as string ?? raw?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(text))
            {
                return new QuickerRpcClipboardSpecialFormatReadResult
                {
                    Success = true,
                    HasData = false,
                };
            }

            return new QuickerRpcClipboardSpecialFormatReadResult
            {
                Success = true,
                HasData = true,
                Text = text,
            };
        }
        catch (Exception ex)
        {
            return Fail(ex.Message);
        }
    }

    public static QuickerRpcClipboardSpecialFormatWriteResult Write(string? format, string? text)
    {
        if (!QuickerInternalAccess.IsInQuicker)
        {
            return WriteFail("QuickerRpc plugin is not running inside Quicker.");
        }

        var fmt = (format ?? string.Empty).Trim();
        if (fmt.Length == 0)
        {
            return WriteFail("Clipboard format is required.");
        }

        if (string.IsNullOrEmpty(text))
        {
            return WriteFail("Clipboard text is empty.");
        }

        try
        {
            if (!ClipboardHelper.SetData(fmt, text))
            {
                return WriteFail("Failed to write clipboard (format may be locked by another app).");
            }

            return new QuickerRpcClipboardSpecialFormatWriteResult { Success = true };
        }
        catch (Exception ex)
        {
            return WriteFail(ex.Message);
        }
    }

    private static QuickerRpcClipboardSpecialFormatReadResult Fail(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
            HasData = false,
        };

    private static QuickerRpcClipboardSpecialFormatWriteResult WriteFail(string message) =>
        new()
        {
            Success = false,
            ErrorMessage = message,
        };
}
