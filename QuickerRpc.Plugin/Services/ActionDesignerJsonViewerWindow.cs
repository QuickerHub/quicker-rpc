using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using ICSharpCode.AvalonEdit;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Modeless JSON viewer for the open action designer (AvalonEdit, read-only).
/// </summary>
internal static class ActionDesignerJsonViewerWindow
{
    public static void TryShow(
        Window owner,
        string json,
        string? titleSuffix = null,
        bool compressed = false,
        string? titleOverride = null)
    {
        if (owner is null || string.IsNullOrEmpty(json))
        {
            return;
        }

        var label = compressed ? "压缩 XAction" : "动作 JSON";
        var title = titleOverride ?? (string.IsNullOrWhiteSpace(titleSuffix)
            ? $"{label} 定义"
            : $"{label} - {titleSuffix}");

        var editor = CreateEditor(json, owner);

        var copyButton = new Button
        {
            Content = "复制",
            Padding = new Thickness(12, 4, 12, 4),
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        copyButton.Click += (_, _) =>
        {
            if (ClipboardSta.TrySetText(editor.Text, out var error))
            {
                PopupMessage.Success("已复制到剪贴板。");
            }
            else
            {
                PopupMessage.Warning(error ?? "复制失败。");
            }
        };

        var toolbar = new DockPanel
        {
            Margin = new Thickness(8, 8, 8, 4),
            LastChildFill = true,
        };
        DockPanel.SetDock(copyButton, Dock.Right);
        toolbar.Children.Add(copyButton);

        var root = new DockPanel();
        DockPanel.SetDock(toolbar, Dock.Top);
        root.Children.Add(toolbar);
        root.Children.Add(editor);

        var window = new Window
        {
            Title = title,
            Width = 860,
            Height = 640,
            MinWidth = 480,
            MinHeight = 320,
            Owner = owner,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            ShowInTaskbar = false,
            Content = root,
        };

        ActionDesignerJsonViewerTheme.ApplyWindow(window, owner);
        EnableEscapeToClose(window);
        window.Loaded += (_, _) => editor.Focus();
        window.Show();
    }

    private static void EnableEscapeToClose(Window window)
    {
        window.PreviewKeyDown += (_, e) =>
        {
            if (e.Key != Key.Escape)
            {
                return;
            }

            window.Close();
            e.Handled = true;
        };
    }

    private static TextEditor CreateEditor(string json, Window? owner)
    {
        var editor = new TextEditor
        {
            FontFamily = new FontFamily("Consolas"),
            FontSize = 13,
            IsReadOnly = true,
            ShowLineNumbers = true,
            WordWrap = false,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Margin = new Thickness(8, 0, 8, 8),
            Text = json,
        };

        ActionDesignerJsonViewerTheme.ApplyEditor(editor, owner);
        return editor;
    }
}
