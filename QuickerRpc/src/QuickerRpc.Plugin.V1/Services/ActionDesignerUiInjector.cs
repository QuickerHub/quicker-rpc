using System;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Injects QuickerAgent chat + optional owner tools tabs into <c>ActionDesignerWindow.ToolTab</c>.
/// Owner: auto-select tools tab on first open. Public: chat tab only, no auto-select.
/// </summary>
internal static class ActionDesignerUiInjector
{
    private const int SelectTabPassCount = 8;
    private const int SelectTabPumpFrames = 25;

    internal const string InjectTabTag = "QuickerRpc.InjectTab";

    private static readonly ConditionalWeakTable<TabControl, SelectionChangedEventHandler> ToolContentHooks = new();
    private static readonly ConditionalWeakTable<TabControl, ToolTabPaddingState> OriginalToolTabPadding = new();

    private sealed class ToolTabPaddingState
    {
        public Thickness OriginalPadding;
    }

    public static bool TryInject(Window designer) => TryInjectCore(designer, reload: false, selectTab: false);

    /// <summary>
    /// Removes any existing QuickerRpc tab and injects a fresh tools panel (startup / hot-reload).
    /// </summary>
    /// <param name="selectTab">When true, owner auto-selects the QuickerRpc tools tab (designer first open).</param>
    public static bool ReloadInject(Window designer, bool selectTab = false)
    {
        if (!ActionDesignerInjectionGate.CanInjectChatTab()
            && !ActionDesignerInjectionGate.CanInjectToolsTab())
        {
            return false;
        }

        if (!ActionDesignerReflection.IsDesignerWindow(designer))
        {
            return false;
        }

        ActionDesignerUiSave.WaitUntilDesignerLoaded(designer);
        if (!designer.IsLoaded)
        {
            return false;
        }

        RemoveInjectedTab(designer);
        return TryInjectCore(designer, reload: true, selectTab);
    }

    /// <summary>
    /// Reload QuickerRpc tabs on every open <c>ActionDesignerWindow</c>.
    /// </summary>
    public static int ReloadAllOpenDesigners(bool selectTab = false)
    {
        if (Application.Current?.Windows is null)
        {
            return 0;
        }

        var count = 0;
        foreach (Window window in Application.Current.Windows)
        {
            if (ReloadInject(window, selectTab))
            {
                count++;
            }

            if (ActionDesignerReflection.IsDesignerWindow(window))
            {
                ActionDesignerGlobalSubProgramReferenceInjector.ScheduleDeferredInject(window);
            }
        }

        return count;
    }

    private static bool TryInjectCore(Window designer, bool reload, bool selectTab)
    {
        if (!ActionDesignerReflection.IsDesignerWindow(designer))
        {
            return false;
        }

        if (!ActionDesignerInjectionGate.CanInjectChatTab()
            && !ActionDesignerInjectionGate.CanInjectToolsTab())
        {
            return false;
        }

        if (!ActionDesignerReflection.TryGetToolTab(designer, out var toolTab) || toolTab is null)
        {
            return false;
        }

        TryCompactToolTabStrip(toolTab);

        var injectedAny = false;

        if (ActionDesignerInjectionGate.CanInjectChatTab())
        {
            injectedAny |= ActionDesignerAgentTabInjector.TryInject(designer, toolTab);
        }
        else
        {
            ActionDesignerAgentTabInjector.Remove(designer, toolTab);
        }

        if (ActionDesignerInjectionGate.CanInjectToolsTab())
        {
            injectedAny |= TryInjectOrRefreshToolsTab(designer, toolTab, reload);
            ActionDesignerGlobalSubProgramReferenceInjector.TryInject(designer);
            ActionDesignerGlobalSubProgramReferenceInjector.ScheduleDeferredInject(designer);
        }
        else
        {
            RemoveInjectedTabs(toolTab);
        }

        if (injectedAny)
        {
            EnsureToolContentSelectionHook(designer, toolTab);
            ActionDesignerReflection.TrySyncToolContentForSelectedTab(designer, toolTab);
        }

        if (selectTab)
        {
            var tabToSelect = ResolveDefaultSelectTab(toolTab);
            if (tabToSelect is not null)
            {
                ScheduleSelectInjectedTab(designer, toolTab, tabToSelect);
            }
        }

        return injectedAny;
    }

    private static TabItem? ResolveDefaultSelectTab(TabControl toolTab)
    {
        if (!ActionDesignerInjectionGate.ShouldAutoSelectToolsTabOnOpen())
        {
            return null;
        }

        return FindInjectedTab(toolTab);
    }

    private static bool TryInjectOrRefreshToolsTab(Window designer, TabControl toolTab, bool reload)
    {
        if (!reload)
        {
            var existing = FindInjectedTab(toolTab);
            if (existing is not null)
            {
                EnsureIconHeader(existing);
                existing.Content = BuildToolsPanel(designer);
                return true;
            }
        }

        try
        {
            var tabItem = new TabItem
            {
                Header = ActionDesignerTabHeader.Create(),
                Tag = InjectTabTag,
                Content = BuildToolsPanel(designer),
            };

            toolTab.Items.Add(tabItem);
            return true;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] ActionDesignerUiInjector.TryInjectOrRefreshToolsTab failed: {0}", ex.Message);
            return false;
        }
    }

    private static void ScheduleSelectInjectedTab(Window designer, TabControl toolTab, TabItem tabItem)
    {
        var dispatcher = designer.Dispatcher ?? QuickerDispatcherInvoke.AppDispatcher;
        if (dispatcher is null)
        {
            return;
        }

        for (var pass = 0; pass < SelectTabPassCount; pass++)
        {
            var passIndex = pass;
            var priority = passIndex switch
            {
                0 => DispatcherPriority.Loaded,
                1 => DispatcherPriority.Background,
                _ => DispatcherPriority.ApplicationIdle,
            };

            _ = dispatcher.BeginInvoke(
                priority,
                new Action(() => TrySelectInjectedTabWhenReady(designer, toolTab, tabItem, passIndex)));
        }
    }

    private static void TrySelectInjectedTabWhenReady(
        Window designer,
        TabControl toolTab,
        TabItem tabItem,
        int passIndex)
    {
        if ((!ActionDesignerInjectionGate.CanInjectChatTab()
                && !ActionDesignerInjectionGate.CanInjectToolsTab())
            || !designer.IsLoaded
            || !toolTab.Items.Contains(tabItem))
        {
            return;
        }

        ActionDesignerUiSave.WaitUntilDesignerLoaded(designer, maxAttempts: 30, sleepMs: 5);
        for (var i = 0; i < SelectTabPumpFrames; i++)
        {
            ActionDesignerUiSave.PumpDispatcherOnce();
        }

        if (TryApplyInjectedTabSelection(designer, toolTab, tabItem))
        {
            return;
        }

        if (passIndex == SelectTabPassCount - 1)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] Failed to select injected designer tab after deferred passes.");
        }
    }

    private static bool TryApplyInjectedTabSelection(Window designer, TabControl toolTab, TabItem tabItem)
    {
        try
        {
            var index = toolTab.Items.IndexOf(tabItem);
            if (index < 0)
            {
                return false;
            }

            toolTab.SelectedIndex = index;
            toolTab.SelectedItem = tabItem;
            tabItem.Focus();
            ActionDesignerReflection.TrySyncToolContentForSelectedTab(designer, toolTab);

            return ReferenceEquals(toolTab.SelectedItem, tabItem) || toolTab.SelectedIndex == index;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryApplyInjectedTabSelection failed: {0}", ex.Message);
            return false;
        }
    }

    public static void RemoveToolsTabs()
    {
        if (Application.Current?.Windows is null)
        {
            return;
        }

        foreach (Window window in Application.Current.Windows)
        {
            if (!ActionDesignerReflection.IsDesignerWindow(window))
            {
                continue;
            }

            if (!ActionDesignerReflection.TryGetToolTab(window, out var toolTab) || toolTab is null)
            {
                continue;
            }

            RemoveInjectedTabs(toolTab);
            ActionDesignerReflection.TrySyncToolContentForSelectedTab(window, toolTab);
        }
    }

    public static void RemoveChatTabs()
    {
        if (Application.Current?.Windows is null)
        {
            return;
        }

        foreach (Window window in Application.Current.Windows)
        {
            if (!ActionDesignerReflection.IsDesignerWindow(window))
            {
                continue;
            }

            if (!ActionDesignerReflection.TryGetToolTab(window, out var toolTab) || toolTab is null)
            {
                continue;
            }

            ActionDesignerAgentTabInjector.Remove(window, toolTab);
            ActionDesignerReflection.TrySyncToolContentForSelectedTab(window, toolTab);
        }
    }

    public static void RemoveAllInjectedTabs()
    {
        if (Application.Current?.Windows is null)
        {
            return;
        }

        foreach (Window window in Application.Current.Windows)
        {
            if (!ActionDesignerReflection.IsDesignerWindow(window))
            {
                continue;
            }

            if (!ActionDesignerReflection.TryGetToolTab(window, out var toolTab) || toolTab is null)
            {
                continue;
            }

            ActionDesignerAgentTabInjector.Remove(window, toolTab);
            RemoveInjectedTabs(toolTab);
        }

        ActionDesignerGlobalSubProgramReferenceInjector.RemoveAll();
    }

    private static void RemoveInjectedTab(Window designer)
    {
        if (!ActionDesignerReflection.TryGetToolTab(designer, out var toolTab) || toolTab is null)
        {
            return;
        }

        RemoveInjectedTabs(toolTab);
        ActionDesignerReflection.TrySyncToolContentForSelectedTab(designer, toolTab);
    }

    private static void EnsureToolContentSelectionHook(Window designer, TabControl toolTab)
    {
        if (ToolContentHooks.TryGetValue(toolTab, out _))
        {
            return;
        }

        SelectionChangedEventHandler handler = (_, e) =>
        {
            if (!ReferenceEquals(e.OriginalSource, toolTab))
            {
                return;
            }

            ActionDesignerReflection.TrySyncToolContentForSelectedTab(designer, toolTab);
        };

        toolTab.SelectionChanged += handler;
        ToolContentHooks.Add(toolTab, handler);
        EnsureToolContentBlankClickGuard(designer);
    }

    private static readonly ConditionalWeakTable<ContentControl, MouseButtonEventHandler> ToolContentBlankClickGuards = new();

    /// <summary>
    /// Quicker routes blank <c>ToolContent</c> clicks back to the module toolbox tab; swallow those
    /// while a plugin tab remains selected.
    /// </summary>
    private static void EnsureToolContentBlankClickGuard(Window designer)
    {
        if (!ActionDesignerReflection.TryGetToolContent(designer, out var toolContent)
            || toolContent is null)
        {
            return;
        }

        if (ToolContentBlankClickGuards.TryGetValue(toolContent, out _))
        {
            return;
        }

        MouseButtonEventHandler handler = (_, e) =>
        {
            if (!ActionDesignerReflection.TryGetToolTab(designer, out var toolTab)
                || toolTab?.SelectedItem is not TabItem selectedTab
                || !ActionDesignerReflection.IsPluginToolTab(selectedTab))
            {
                return;
            }

            if (IsInteractiveClickTarget(e.OriginalSource as DependencyObject))
            {
                return;
            }

            e.Handled = true;
        };

        toolContent.PreviewMouseDown += handler;
        ToolContentBlankClickGuards.Add(toolContent, handler);
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

    private static void RemoveInjectedTabs(TabControl toolTab)
    {
        for (var i = toolTab.Items.Count - 1; i >= 0; i--)
        {
            if (toolTab.Items[i] is TabItem tab && IsInjectedTab(tab))
            {
                toolTab.Items.RemoveAt(i);
            }
        }
    }

    private static bool IsInjectedTab(TabItem tab) =>
        string.Equals(tab.Tag as string, InjectTabTag, StringComparison.Ordinal);

    private static TabItem? FindInjectedTab(TabControl toolTab)
    {
        foreach (var item in toolTab.Items)
        {
            if (item is TabItem tab && IsInjectedTab(tab))
            {
                return tab;
            }
        }

        return null;
    }

    private static void EnsureIconHeader(TabItem tab)
    {
        if (tab.Header is Viewbox)
        {
            return;
        }

        tab.Header = ActionDesignerTabHeader.Create();
        tab.ToolTip = null;
    }

    private static void TryCompactToolTabStrip(TabControl toolTab)
    {
        if (!OriginalToolTabPadding.TryGetValue(toolTab, out var state))
        {
            state = new ToolTabPaddingState { OriginalPadding = toolTab.Padding };
            OriginalToolTabPadding.Add(toolTab, state);
        }

        toolTab.Padding = new Thickness(0, 2, 0, 0);
    }

    private static UIElement BuildToolsPanel(Window designer) =>
        ActionDesignerToolsPanel.Build(CreateToolHandlers(designer));

    private static ActionDesignerToolsPanel.Handlers CreateToolHandlers(Window designer) =>
        new()
        {
            CopyActionDefinition = () => OnCopyActionDefinition(designer),
            PasteActionDefinition = () => OnPasteActionDefinition(designer),
            ViewActionJson = () => OnViewActionJson(designer),
            CopyActionId = () => OnCopyActionId(designer),
            CopySteps = () => OnCopySteps(designer),
            PasteSteps = () => OnPasteSteps(designer),
            CopySelectedVariables = () => OnCopySelectedVariables(designer),
            ViewVariableState = () => OnViewVariableState(designer),
            CopySubProgramId = () => OnCopySubProgramId(designer),
            ChangeSubProgramTarget = () => OnChangeSubProgramTarget(designer),
            UpgradeNetworkSubPrograms = () => OnUpgradeNetworkSubPrograms(designer),
            UnlockReadOnly = () => OnUnlockReadOnly(designer),
            Save = () => OnSave(designer),
            TestCatalogSave = () => OnTestCatalogSave(designer),
        };

    private static void OnCopyActionDefinition(Window designer)
    {
        if (!ActionDesignerContext.TryExportXActionJson(designer, out var json, out var error)
            || json is null)
        {
            PopupMessage.Warning(error ?? "复制动作定义失败。");
            return;
        }

        if (!ClipboardSta.TrySetText(json, out error))
        {
            PopupMessage.Warning(error ?? "复制到剪贴板失败。");
            return;
        }

        PopupMessage.Success("动作定义已复制到剪贴板。");
    }

    private static void OnViewActionJson(Window designer)
    {
        if (!ActionDesignerContext.TryExportCompressedXActionJson(designer, out var json, out var error)
            || json is null)
        {
            PopupMessage.Warning(error ?? "读取压缩动作定义失败。");
            return;
        }

        var titleSuffix = ActionDesignerContext.TryReadDesignerEntityId(designer);
        ActionDesignerJsonViewerWindow.TryShow(designer, json, titleSuffix, compressed: true);
    }

    private static void OnPasteActionDefinition(Window designer)
    {
        if (!ActionDesignerClipboardImport.TryReadActionDefinitionJson(out var json, out var readError))
        {
            PopupMessage.Warning(readError ?? "读取剪贴板失败。");
            return;
        }

        if (!ActionDesignerCurrentActionAccess.TrySetActionDefinition(designer, json, out var error))
        {
            PopupMessage.Warning(error ?? "粘贴动作定义失败。");
            return;
        }

        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var applied) || applied is not XAction xAction)
        {
            PopupMessage.Warning("动作定义已写入内存，但无法读取设计器 Action 对象。");
            return;
        }

        PopupMessage.Success(
            $"动作定义已粘贴（{xAction.Steps?.Count ?? 0} 步，{xAction.Variables?.Count ?? 0} 变量，未自动保存）。");
    }

    private static void OnCopyActionId(Window designer)
    {
        if (!ActionDesignerContext.TryCopyActionId(designer, out var actionId, out var error)
            || actionId is null)
        {
            PopupMessage.Warning(error ?? "复制动作 ID 失败。");
            return;
        }

        if (!ClipboardSta.TrySetText(actionId, out error))
        {
            PopupMessage.Warning(error ?? "复制到剪贴板失败。");
            return;
        }

        PopupMessage.Success(actionId);
    }

    private static void OnCopySelectedVariables(Window designer)
    {
        if (!ActionDesignerContext.TryCopySelectedVariableKeys(designer, out var text, out var error))
        {
            PopupMessage.Warning(error ?? "复制变量失败。");
            return;
        }

        if (!ClipboardSta.TrySetText(text, out error))
        {
            PopupMessage.Warning(error ?? "复制到剪贴板失败。");
            return;
        }

        PopupMessage.Success("选中变量名已复制。");
    }

    private static void OnViewVariableState(Window designer)
    {
        if (!ActionDesignerVariableStateService.TryReadVariableStates(designer, out var json, out var error)
            || json is null)
        {
            PopupMessage.Warning(error ?? "读取变量状态失败。");
            return;
        }

        var actionId = ActionDesignerContext.TryReadDesignerEntityId(designer);
        var title = string.IsNullOrWhiteSpace(actionId)
            ? "变量状态"
            : $"变量状态 - {actionId}";
        ActionDesignerJsonViewerWindow.TryShow(designer, json, titleOverride: title);
    }

    private static void OnCopySteps(Window designer)
    {
        if (!ActionDesignerReflection.TryInvokeStepListCopy(designer, out var error))
        {
            PopupMessage.Warning(error ?? "复制步骤失败。");
            return;
        }

        PopupMessage.Success("步骤已复制。");
    }

    private static void OnPasteSteps(Window designer)
    {
        if (!ActionDesignerReflection.TryInvokeStepListPaste(designer, out var error))
        {
            PopupMessage.Warning(error ?? "粘贴步骤失败。");
            return;
        }

        PopupMessage.Success("步骤已粘贴。");
    }

    private static void OnCopySubProgramId(Window designer)
    {
        if (!ActionDesignerSubProgramId.TryGetSelectedSubProgramIds(designer, out var text, out var error))
        {
            PopupMessage.Warning(error ?? "获取子程序 ID 失败。");
            return;
        }

        if (!ClipboardSta.TrySetText(text, out error))
        {
            PopupMessage.Warning(error ?? "复制到剪贴板失败。");
            return;
        }

        PopupMessage.Success(text.Contains("\n") ? "子程序 ID 已复制到剪贴板。" : text);
    }

    private static void OnChangeSubProgramTarget(Window designer) =>
        ActionDesignerSubProgramTargetChange.TryChangeSelected(designer);

    private static void OnUpgradeNetworkSubPrograms(Window designer)
    {
        if (ActionDesignerNetworkSubProgramUpgrade.TryUpgradeSelected(designer, out var count, out var error))
        {
            PopupMessage.Success($"已升级 {count} 处网络子程序引用。");
            return;
        }

        PopupMessage.Warning(error ?? "升级网络子程序失败。");
    }

    private static void OnUnlockReadOnly(Window designer)
    {
        if (!ActionDesignerReflection.TryUnlockReadOnly(designer, out var changed, out var error))
        {
            PopupMessage.Warning(error ?? "解锁只读失败。");
            return;
        }

        PopupMessage.Success(changed ? "已解除只读限制，可编辑并保存。" : "当前设计器不是只读状态。");
    }

    private static void OnSave(Window designer)
    {
        if (ActionDesignerUiSave.TrySaveOpenDesignerWithoutClose(designer, out _, out var error))
        {
            PopupMessage.Success("已保存（窗口未关闭）。");
            return;
        }

        PopupMessage.Warning(error ?? "保存失败。");
    }

    private static void OnTestCatalogSave(Window designer)
    {
        if (ActionDesignerContext.TryTestCatalogSave(designer, out var summary, out var error))
        {
            PopupMessage.Success(summary);
            return;
        }

        PopupMessage.Warning(error ?? "入库测试失败。");
    }
}
