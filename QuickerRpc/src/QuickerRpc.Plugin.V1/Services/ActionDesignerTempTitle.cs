using System;
using System.Windows;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Assigns a unique placeholder title before first catalog save for unsaved designer actions.
/// </summary>
internal static class ActionDesignerTempTitle
{
    private static readonly string[] PlaceholderTitles =
    {
        "新动作",
        "New Action",
        "未命名",
        "Untitled",
    };

    public static bool NeedsTempTitle(string? title)
    {
        var trimmed = (title ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return true;
        }

        foreach (var placeholder in PlaceholderTitles)
        {
            if (string.Equals(trimmed, placeholder, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static readonly Random Rng = new();

    public static string Allocate() => $"_temp_{Rng.Next(0, 1000):D3}";

    /// <summary>
    /// When the designer action still has a placeholder title, apply <c>_temp_NNN</c> before save.
    /// </summary>
    public static bool TryEnsureOnDesigner(Window designer, out string? appliedTitle, out string? error)
    {
        appliedTitle = null;
        error = null;
        if (ActionDesignerContext.IsSubProgramDesigner(designer))
        {
            return true;
        }

        if (!ActionDesignerUiSave.TryReadDesignerActionTitleText(designer, out var title))
        {
            ActionDesignerContext.TryReadDesignerPresentation(
                designer,
                out title,
                out _,
                out _,
                out _);
        }

        if (!NeedsTempTitle(title))
        {
            return true;
        }

        var temp = Allocate();
        if (!ActionDesignerUiSave.TrySetDesignerActionTitleText(designer, temp, out error))
        {
            return false;
        }

        appliedTitle = temp;
        return true;
    }
}
