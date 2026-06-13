using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Injects an AI chat tab (embedded QuickerAgent) into <c>ActionDesignerWindow.ToolTab</c>.
/// While the tab is selected, the left tool column is widened so the chat is usable.
/// </summary>
internal static class ActionDesignerAgentTabInjector
{
    internal const string TabTag = "QuickerRpc.AgentChatTab";

    /// <summary>Minimum left-column width while the chat tab is selected.</summary>
    private const double ChatColumnMinWidth = 400;
    private const double IconSize = 18;

    private sealed class TabState
    {
        public SelectionChangedEventHandler? Handler;
        public double OriginalColumnMinWidth;
        public bool Widened;
    }

    private static readonly ConditionalWeakTable<TabControl, TabState> States = new();

    /// <summary>Adds the AI tab after the QuickerRpc tools tab (idempotent per designer).</summary>
    public static bool TryInject(Window designer, TabControl toolTab)
    {
        try
        {
            if (FindAgentTab(toolTab) is not null)
            {
                return true;
            }

            var view = new ActionDesignerAgentChatView(designer);
            var tabItem = new TabItem
            {
                Header = CreateHeader(),
                Tag = TabTag,
                Content = view,
            };

            toolTab.Items.Add(tabItem);
            HookSelection(designer, toolTab);
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] AgentTabInjector.TryInject failed: {0}", ex.Message);
            return false;
        }
    }

    public static void Remove(Window designer, TabControl toolTab)
    {
        for (var i = toolTab.Items.Count - 1; i >= 0; i--)
        {
            if (toolTab.Items[i] is not TabItem tab
                || !string.Equals(tab.Tag as string, TabTag, StringComparison.Ordinal))
            {
                continue;
            }

            (tab.Content as ActionDesignerAgentChatView)?.Dispose();
            tab.Content = null;
            toolTab.Items.RemoveAt(i);
        }

        UnhookSelection(designer, toolTab);
    }

    private static TabItem? FindAgentTab(TabControl toolTab)
    {
        foreach (var item in toolTab.Items)
        {
            if (item is TabItem tab && string.Equals(tab.Tag as string, TabTag, StringComparison.Ordinal))
            {
                return tab;
            }
        }

        return null;
    }

    private static void HookSelection(Window designer, TabControl toolTab)
    {
        if (States.TryGetValue(toolTab, out _))
        {
            return;
        }

        var state = new TabState();
        state.Handler = (_, e) =>
        {
            if (!ReferenceEquals(e.OriginalSource, toolTab))
            {
                return;
            }

            OnToolTabSelectionChanged(designer, toolTab, state);
        };

        toolTab.SelectionChanged += state.Handler;
        States.Add(toolTab, state);
    }

    private static void UnhookSelection(Window designer, TabControl toolTab)
    {
        if (!States.TryGetValue(toolTab, out var state))
        {
            return;
        }

        if (state.Handler is not null)
        {
            toolTab.SelectionChanged -= state.Handler;
        }

        RestoreColumnWidth(designer, state);
        States.Remove(toolTab);
    }

    private static void OnToolTabSelectionChanged(Window designer, TabControl toolTab, TabState state)
    {
        try
        {
            var agentTab = FindAgentTab(toolTab);
            var selected = agentTab is not null && ReferenceEquals(toolTab.SelectedItem, agentTab);
            if (selected)
            {
                (agentTab!.Content as ActionDesignerAgentChatView)?.EnsureStarted();
                WidenColumn(designer, state);
            }
            else
            {
                RestoreColumnWidth(designer, state);
            }
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] Agent tab selection handling failed: {0}", ex.Message);
        }
    }

    private static void WidenColumn(Window designer, TabState state)
    {
        if (state.Widened || !TryGetToolColumn(designer, out var column) || column is null)
        {
            return;
        }

        state.OriginalColumnMinWidth = column.MinWidth;
        column.MinWidth = Math.Max(column.MinWidth, ChatColumnMinWidth);
        state.Widened = true;
    }

    private static void RestoreColumnWidth(Window designer, TabState state)
    {
        if (!state.Widened || !TryGetToolColumn(designer, out var column) || column is null)
        {
            state.Widened = false;
            return;
        }

        column.MinWidth = state.OriginalColumnMinWidth;
        state.Widened = false;
    }

    /// <summary>Left tool column is column 0 of the designer root grid (see ActionDesignerWindow.xaml).</summary>
    private static bool TryGetToolColumn(Window designer, out ColumnDefinition? column)
    {
        column = null;
        if (designer.Content is not Grid rootGrid || rootGrid.ColumnDefinitions.Count == 0)
        {
            return false;
        }

        column = rootGrid.ColumnDefinitions[0];
        return true;
    }

    private static UIElement CreateHeader()
    {
        // Chat-bubble-with-spark icon to match the vertical icon tab strip.
        var icon = new Viewbox
        {
            Width = IconSize,
            Height = IconSize,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new Path
            {
                Stretch = Stretch.Uniform,
                Fill = new SolidColorBrush(Color.FromRgb(0x4C, 0x7B, 0xD4)),
                Data = Geometry.Parse(
                    "M3,2 L15,2 C16.1,2 17,2.9 17,4 L17,11 C17,12.1 16.1,13 15,13 L8,13 L4,16.5 L4,13 " +
                    "L3,13 C1.9,13 1,12.1 1,11 L1,4 C1,2.9 1.9,2 3,2 Z " +
                    "M9,4.2 L9.9,6.6 L12.3,7.5 L9.9,8.4 L9,10.8 L8.1,8.4 L5.7,7.5 L8.1,6.6 Z"),
            },
        };

        ToolTipService.SetToolTip(icon, "QuickerAgent AI 对话");
        return icon;
    }
}
