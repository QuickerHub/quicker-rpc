using System;
using System.Reflection;
using System.Windows;

namespace QuickerRpc.Plugin.Services;

/// <summary>Read action-definition JSON from clipboard (plain text or Quicker formats).</summary>
internal static class ActionDesignerClipboardImport
{
    internal const string QuickerActionItemFormat = "quicker-action-item";

    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static bool TryReadActionDefinitionJson(out string json, out string? error)
    {
        json = string.Empty;
        error = null;

        try
        {
            var text = Clipboard.GetText();
            if (LooksLikeJsonObject(text))
            {
                json = text!.Trim();
                return true;
            }
        }
        catch (Exception ex)
        {
            error = "读取剪贴板文本失败: " + ex.Message;
            return false;
        }

        try
        {
            if (Clipboard.ContainsData(QuickerActionItemFormat)
                && TryExtractActionItemData(Clipboard.GetData(QuickerActionItemFormat), out var fromItem)
                && LooksLikeJsonObject(fromItem))
            {
                json = fromItem!.Trim();
                return true;
            }
        }
        catch (Exception ex)
        {
            error = "读取 quicker-action-item 失败: " + ex.Message;
            return false;
        }

        error = "剪贴板中没有动作定义 JSON（请先「复制动作定义」，或使用 quicker-action-item 格式）。";
        return false;
    }

    private static bool LooksLikeJsonObject(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var trimmed = text.TrimStart();
        return trimmed.StartsWith("{", StringComparison.Ordinal);
    }

    private static bool TryExtractActionItemData(object? data, out string? json)
    {
        json = null;
        if (data is null)
        {
            return false;
        }

        var dataProp = data.GetType().GetProperty("Data", InstanceAll);
        if (dataProp?.GetValue(data) is string s && !string.IsNullOrWhiteSpace(s))
        {
            json = s;
            return true;
        }

        return false;
    }
}
