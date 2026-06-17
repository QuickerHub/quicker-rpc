using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Modal picker to choose a global subprogram call identifier for sys:subprogram steps.
/// </summary>
internal sealed class ActionDesignerSubProgramTargetPickerWindow : Window
{
    private readonly TextBox _searchBox;
    private readonly ListBox _resultsList;
    private readonly TextBlock _statusText;
    private readonly DispatcherTimer _searchTimer;
    private IReadOnlyList<ActionDesignerSubProgramTargetSearch.Row> _rows = Array.Empty<ActionDesignerSubProgramTargetSearch.Row>();

    public string? SelectedCallIdentifier { get; private set; }

    private ActionDesignerSubProgramTargetPickerWindow(Window owner, string? initialText)
    {
        Title = "修改子程序目标";
        Width = 640;
        Height = 460;
        MinWidth = 480;
        MinHeight = 360;
        Owner = owner;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;

        _searchBox = new TextBox
        {
            Margin = new Thickness(12, 12, 12, 6),
            Padding = new Thickness(6, 4, 6, 4),
        };
        _searchBox.TextChanged += (_, _) => ScheduleSearch();

        _statusText = new TextBlock
        {
            Margin = new Thickness(12, 0, 12, 6),
            FontSize = 11,
            TextWrapping = TextWrapping.Wrap,
        };
        ActionDesignerTheme.TrySetResourceReference(_statusText, TextBlock.ForegroundProperty, "SecondaryTextBrush");

        _resultsList = new ListBox
        {
            Margin = new Thickness(12, 0, 12, 8),
            DisplayMemberPath = nameof(ActionDesignerSubProgramTargetSearch.Row.DisplayLabel),
            MinHeight = 220,
        };
        _resultsList.MouseDoubleClick += (_, e) =>
        {
            if (e.ChangedButton != MouseButton.Left)
            {
                return;
            }

            if (TryAcceptSelection())
            {
                e.Handled = true;
            }
        };
        _resultsList.SelectionChanged += (_, _) => UpdateStatusForSelection();

        var okButton = new Button
        {
            Content = "确定",
            MinWidth = 72,
            Padding = new Thickness(12, 4, 12, 4),
            IsDefault = true,
        };
        ActionDesignerTheme.ApplyPrimaryButton(okButton);
        okButton.Click += (_, _) => OnOk();

        var cancelButton = new Button
        {
            Content = "取消",
            MinWidth = 72,
            Margin = new Thickness(8, 0, 0, 0),
            Padding = new Thickness(12, 4, 12, 4),
            IsCancel = true,
        };
        ActionDesignerTheme.ApplyChipButton(cancelButton);
        cancelButton.Click += (_, _) =>
        {
            DialogResult = false;
            Close();
        };

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(12, 0, 12, 12),
        };
        buttons.Children.Add(okButton);
        buttons.Children.Add(cancelButton);

        var root = new DockPanel();
        DockPanel.SetDock(_searchBox, Dock.Top);
        DockPanel.SetDock(_statusText, Dock.Top);
        DockPanel.SetDock(buttons, Dock.Bottom);
        root.Children.Add(_searchBox);
        root.Children.Add(_statusText);
        root.Children.Add(buttons);
        root.Children.Add(_resultsList);
        Content = root;

        _searchTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(180) };
        _searchTimer.Tick += (_, _) =>
        {
            _searchTimer.Stop();
            RunSearch();
        };

        ActionDesignerJsonViewerTheme.ApplyWindow(this, owner);
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape)
            {
                DialogResult = false;
                Close();
                e.Handled = true;
            }
        };

        if (!string.IsNullOrWhiteSpace(initialText))
        {
            _searchBox.Text = initialText;
        }
        else
        {
            RunSearch();
        }

        Loaded += (_, _) =>
        {
            _searchBox.Focus();
            _searchBox.SelectAll();
        };
    }

    public static bool TryPick(Window owner, string? initialText, out string? callIdentifier)
    {
        callIdentifier = null;
        var window = new ActionDesignerSubProgramTargetPickerWindow(owner, initialText);
        if (window.ShowDialog() != true || string.IsNullOrWhiteSpace(window.SelectedCallIdentifier))
        {
            return false;
        }

        callIdentifier = window.SelectedCallIdentifier;
        return true;
    }

    private void ScheduleSearch()
    {
        _searchTimer.Stop();
        _searchTimer.Start();
    }

    private void RunSearch()
    {
        _rows = ActionDesignerSubProgramTargetSearch.Search(_searchBox.Text);
        _resultsList.ItemsSource = _rows;
        if (_rows.Count > 0 && _resultsList.SelectedIndex < 0)
        {
            _resultsList.SelectedIndex = 0;
        }

        _statusText.Text = _rows.Count == 0
            ? "未找到匹配的公共子程序。可继续输入名称、ID 或粘贴 %%id / %名称% 后重试。"
            : $"找到 {_rows.Count} 个公共子程序。双击或选中后点「确定」。";
    }

    private void UpdateStatusForSelection()
    {
        if (_resultsList.SelectedItem is ActionDesignerSubProgramTargetSearch.Row row)
        {
            _statusText.Text = $"将写入：{row.CallIdentifier}";
        }
    }

    private void OnOk()
    {
        if (TryAcceptSelection())
        {
            return;
        }

        var text = _searchBox.Text.Trim();
        if (text.Length == 0)
        {
            PopupMessage.Warning("请输入或选择目标子程序。");
            return;
        }

        if (ActionDesignerSubProgramTargetSearch.TryResolveCallIdentifier(text, out var resolved)
            && !string.IsNullOrWhiteSpace(resolved))
        {
            SelectedCallIdentifier = resolved;
            DialogResult = true;
            Close();
            return;
        }

        SelectedCallIdentifier = text;
        DialogResult = true;
        Close();
    }

    private bool TryAcceptSelection()
    {
        if (_resultsList.SelectedItem is ActionDesignerSubProgramTargetSearch.Row selected
            && !string.IsNullOrWhiteSpace(selected.CallIdentifier))
        {
            SelectedCallIdentifier = selected.CallIdentifier;
            DialogResult = true;
            Close();
            return true;
        }

        return false;
    }
}
