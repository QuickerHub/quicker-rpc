using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Grouped, compact toolbar for the injected QuickerRpc designer tools tab.
/// </summary>
internal static class ActionDesignerToolsPanel
{
    internal sealed class Handlers
    {
        public required Action CopyActionDefinition { get; init; }
        public required Action PasteActionDefinition { get; init; }
        public required Action ViewActionJson { get; init; }
        public required Action CopyActionId { get; init; }
        public required Action CopySteps { get; init; }
        public required Action PasteSteps { get; init; }
        public required Action CopySelectedVariables { get; init; }
        public required Action ViewVariableState { get; init; }
        public required Action CopySubProgramId { get; init; }
        public required Action UpgradeNetworkSubPrograms { get; init; }
        public required Action UnlockReadOnly { get; init; }
        public required Action Save { get; init; }
    }

    public static UIElement Build(Handlers handlers)
    {
        var stack = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Top,
        };

        stack.Children.Add(BuildSection(
            "动作",
            new ToolChip("复制", "fa:Light_Copy:#4C7BD4", "复制动作定义", handlers.CopyActionDefinition),
            new ToolChip("粘贴", "fa:Light_FileImport:#22C55E", "粘贴动作定义", handlers.PasteActionDefinition),
            new ToolChip("JSON", "fa:Light_BracketsCurly:#8B5CF6", "查看动作 JSON", handlers.ViewActionJson),
            new ToolChip("ID", "fa:Light_Fingerprint:#3B82F6", "复制动作 ID", handlers.CopyActionId)));

        stack.Children.Add(BuildDualSection(
            "步骤",
            new ToolChip("复制", "fa:Light_Clone:#4C7BD4", "复制步骤", handlers.CopySteps),
            new ToolChip("粘贴", "fa:Light_Paste:#22C55E", "粘贴步骤", handlers.PasteSteps),
            "变量",
            new ToolChip("复制", "fa:Light_Sigma:#F59E0B", "复制选中变量", handlers.CopySelectedVariables),
            new ToolChip("状态", "fa:Light_Eye:#14B8A6", "查看变量状态", handlers.ViewVariableState)));

        stack.Children.Add(BuildFooterSection(
            handlers.CopySubProgramId,
            handlers.UpgradeNetworkSubPrograms,
            handlers.UnlockReadOnly,
            handlers.Save));

        var root = new Border
        {
            Padding = new Thickness(6, 8, 6, 8),
            HorizontalAlignment = HorizontalAlignment.Stretch,
            VerticalAlignment = VerticalAlignment.Stretch,
            MinHeight = 96,
            Child = stack,
        };
        ActionDesignerTheme.ApplyPageSurface(root);
        AttachBlankClickGuard(root);

        return root;
    }

    private readonly record struct ToolChip(
        string Caption,
        string FaSpec,
        string ToolTip,
        Action Handler);

    private static void AttachBlankClickGuard(FrameworkElement root)
    {
        root.PreviewMouseDown += (_, e) =>
        {
            if (IsInteractiveClickTarget(e.OriginalSource as DependencyObject))
            {
                return;
            }

            // Quicker treats ToolContent blank clicks as "return to module toolbox".
            e.Handled = true;
        };
    }

    private static bool IsInteractiveClickTarget(DependencyObject? source)
    {
        while (source is not null)
        {
            if (source is Button or TextBox or ScrollViewer or ListBox or ComboBox)
            {
                return true;
            }

            source = VisualTreeHelper.GetParent(source);
        }

        return false;
    }

    private static UIElement BuildSection(string title, params ToolChip[] chips)
    {
        var card = CreateCard();
        var inner = (StackPanel)card.Child;
        inner.Children.Add(CreateSectionTitle(title));
        inner.Children.Add(CreateChipRow(chips));
        return card;
    }

    private static UIElement BuildDualSection(
        string leftTitle,
        ToolChip leftA,
        ToolChip leftB,
        string rightTitle,
        ToolChip rightA,
        ToolChip rightB)
    {
        var card = CreateCard();
        var inner = (StackPanel)card.Child;

        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var left = new StackPanel();
        left.Children.Add(CreateSectionTitle(leftTitle));
        left.Children.Add(CreateChipRow(leftA, leftB));
        Grid.SetColumn(left, 0);
        row.Children.Add(left);

        var divider = new Border
        {
            Width = 1,
            Margin = new Thickness(8, 18, 8, 2),
            VerticalAlignment = VerticalAlignment.Stretch,
        };
        ActionDesignerTheme.ApplyDivider(divider);
        Grid.SetColumn(divider, 1);
        row.Children.Add(divider);

        var right = new StackPanel();
        right.Children.Add(CreateSectionTitle(rightTitle));
        right.Children.Add(CreateChipRow(rightA, rightB));
        Grid.SetColumn(right, 2);
        row.Children.Add(right);

        inner.Children.Add(row);
        return card;
    }

    private static UIElement BuildFooterSection(
        Action copySubProgramId,
        Action upgradeNetwork,
        Action unlockReadOnly,
        Action save)
    {
        var card = CreateCard();
        var inner = (StackPanel)card.Child;
        inner.Children.Add(CreateSectionTitle("子程序 · 维护"));

        var row = new DockPanel { LastChildFill = false };
        var chips = new StackPanel { Orientation = Orientation.Horizontal };
        chips.Children.Add(CreateChip("子程序 ID", "fa:Light_PuzzlePiece:#A855F7", "获取子程序 ID", copySubProgramId));
        chips.Children.Add(CreateChip("升级", "fa:Light_CloudUpload:#0EA5E9", "升级网络子程序", upgradeNetwork));
        chips.Children.Add(CreateChip("解锁", "fa:Light_Unlock:#F59E0B", "解锁只读", unlockReadOnly));
        DockPanel.SetDock(chips, Dock.Left);
        row.Children.Add(chips);

        var saveButton = CreatePrimaryButton("保存", "fa:Light_Save:#FFFFFF", "保存", save);
        saveButton.Margin = new Thickness(8, 0, 0, 0);
        saveButton.VerticalAlignment = VerticalAlignment.Bottom;
        DockPanel.SetDock(saveButton, Dock.Right);
        row.Children.Add(saveButton);

        inner.Children.Add(row);
        return card;
    }

    private static Border CreateCard()
    {
        var card = new Border
        {
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(8, 6, 8, 8),
            Margin = new Thickness(0, 0, 0, 6),
            Child = new StackPanel(),
        };
        ActionDesignerTheme.ApplyCardSurface(card);
        return card;
    }

    private static TextBlock CreateSectionTitle(string title)
    {
        var text = new TextBlock
        {
            Text = title,
            FontSize = 10,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 4),
        };
        ActionDesignerTheme.ApplySectionTitle(text);
        return text;
    }

    private static UIElement CreateChipRow(params ToolChip[] chips)
    {
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        foreach (var chip in chips)
        {
            row.Children.Add(CreateChip(chip.Caption, chip.FaSpec, chip.ToolTip, chip.Handler));
        }

        return row;
    }

    private static Button CreateChip(string caption, string faSpec, string toolTip, Action onClick)
    {
        var content = new StackPanel
        {
            Orientation = Orientation.Vertical,
            HorizontalAlignment = HorizontalAlignment.Center,
        };

        if (ActionDesignerFaIcon.TryCreate(faSpec, 14) is { } icon)
        {
            content.Children.Add(icon);
        }

        content.Children.Add(new TextBlock
        {
            Text = caption,
            FontSize = 10,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 2, 0, 0),
        });

        var button = new Button
        {
            Content = content,
            ToolTip = toolTip,
            MinWidth = 42,
            MinHeight = 44,
            Padding = new Thickness(6, 4, 6, 4),
            Margin = new Thickness(0, 0, 4, 0),
            BorderThickness = new Thickness(1),
            Cursor = Cursors.Hand,
        };
        ActionDesignerTheme.ApplyChipButton(button);
        button.Click += (_, _) => onClick();
        return button;
    }

    private static Button CreatePrimaryButton(string caption, string faSpec, string toolTip, Action onClick)
    {
        var content = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Center,
        };

        if (ActionDesignerFaIcon.TryCreate(faSpec, 14) is { } icon)
        {
            content.Children.Add(icon);
        }

        content.Children.Add(new TextBlock
        {
            Text = caption,
            FontSize = 11,
            FontWeight = FontWeights.SemiBold,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(4, 0, 0, 0),
        });

        var button = new Button
        {
            Content = content,
            ToolTip = toolTip,
            MinWidth = 64,
            MinHeight = 36,
            Padding = new Thickness(10, 6, 10, 6),
            BorderThickness = new Thickness(1),
            Cursor = Cursors.Hand,
        };
        ActionDesignerTheme.ApplyPrimaryButton(button);
        button.Click += (_, _) => onClick();
        return button;
    }
}
