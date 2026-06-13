using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using Newtonsoft.Json.Linq;
using Quicker.Common.Entities;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.Storage;
using QuickerRpc.Plugin.Reflection;
using ActionVariable = Quicker.Domain.Actions.X.Storage.ActionVariable;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Cached reflection against <c>Quicker.View.X.ActionDesignerWindow</c> and child controls.
/// Field names are stable on Release builds (verified via Plugin.Test probes).
/// </summary>
internal static class ActionDesignerReflection
{
    private const string DesignerWindowTypeFullName = "Quicker.View.X.ActionDesignerWindow";

    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static Type? _designerWindowType;

    public static Type? DesignerWindowType =>
        _designerWindowType ??= ResolveQuickerType(DesignerWindowTypeFullName);

    public static bool IsDesignerWindow(Window window) =>
        window is not null
        && DesignerWindowType is not null
        && DesignerWindowType.IsInstanceOfType(window);

    public static bool TryGetToolTab(Window designer, out System.Windows.Controls.TabControl? toolTab)
    {
        toolTab = null;
        if (!TryGetField(designer, "ToolTab", out var value))
        {
            return false;
        }

        toolTab = value as TabControl;
        return toolTab is not null;
    }

    public static bool TryGetToolContent(Window designer, out ContentControl? toolContent)
    {
        toolContent = null;
        if (!TryGetField(designer, "ToolContent", out var value))
        {
            return false;
        }

        toolContent = value as ContentControl;
        return toolContent is not null;
    }

    /// <summary>
    /// Mirrors Quicker's ToolTab selection handler for native tabs; plugin tabs use
    /// <see cref="TabItem.Content"/> directly.
    /// </summary>
    public static void TrySyncToolContentForSelectedTab(Window designer, TabControl toolTab)
    {
        if (!TryGetField(designer, "ToolContent", out var value) || value is not ContentControl toolContent)
        {
            return;
        }

        if (toolTab.SelectedItem is not TabItem selectedTab)
        {
            return;
        }

        if (IsPluginToolTab(selectedTab))
        {
            var pluginContent = selectedTab.Content;
            if (pluginContent is not null && !ReferenceEquals(toolContent.Content, pluginContent))
            {
                toolContent.Content = pluginContent;
            }

            return;
        }

        var content = ResolveToolTabPanelContent(designer, toolTab, selectedTab);
        if (content is null || ReferenceEquals(toolContent.Content, content))
        {
            return;
        }

        toolContent.Content = content;
    }

    public static bool IsPluginToolTab(TabItem tab)
    {
        var tag = tab.Tag as string;
        return string.Equals(tag, ActionDesignerUiInjector.InjectTabTag, StringComparison.Ordinal)
            || string.Equals(tag, ActionDesignerAgentTabInjector.TabTag, StringComparison.Ordinal);
    }

    private static object? ResolveToolTabPanelContent(Window designer, TabControl toolTab, TabItem tabItem)
    {
        var index = toolTab.Items.IndexOf(tabItem);
        if (index < 0)
        {
            return tabItem.Content;
        }

        return index switch
        {
            0 => TryGetToolboxControl(designer) ?? tabItem.Content,
            1 => GetDesignerFieldValue(designer, "InternalSubProgramListControl") ?? tabItem.Content,
            2 => GetDesignerFieldValue(designer, "GlobalSubProgramsList") ?? tabItem.Content,
            _ => tabItem.Content,
        };
    }

    private static object? TryGetToolboxControl(Window designer)
    {
        var toolboxProp = DesignerWindowType?.GetProperty("TheToolbox", InstanceAll);
        var toolbox = toolboxProp?.GetValue(designer);
        if (toolbox is DependencyObject)
        {
            return toolbox;
        }

        if (DesignerWindowType is null)
        {
            return null;
        }

        foreach (var field in DesignerWindowType.GetFields(InstanceAll))
        {
            if (field.FieldType.Name != "IToolBoxControl")
            {
                continue;
            }

            var value = field.GetValue(designer);
            if (value is DependencyObject)
            {
                return value;
            }
        }

        return null;
    }

    private static object? GetDesignerFieldValue(Window designer, string fieldName)
    {
        return TryGetField(designer, fieldName, out var value) ? value : null;
    }

    public static bool TryGetActionProperty(Window designer, out object? xAction)
    {
        xAction = null;
        if (designer is null)
        {
            return false;
        }

        var prop = DesignerWindowType?.GetProperty("Action", InstanceAll);
        if (prop is null)
        {
            return false;
        }

        xAction = prop.GetValue(designer);
        return xAction is not null;
    }

    public static bool TryGetActionStepsWrapper(Window designer, out object? wrapper)
    {
        wrapper = null;
        return TryGetField(designer, "ActionStepsWrapper", out wrapper) && wrapper is not null;
    }

    public static bool TryGetVariableListControl(Window designer, out object? control)
    {
        control = null;
        return TryGetField(designer, "VariableListControl", out control) && control is not null;
    }

    public static bool TryGetSelectedSteps(Window designer, out IReadOnlyList<ActionStep> steps)
    {
        steps = Array.Empty<ActionStep>();
        if (!TryGetActiveStepListBox(designer, out var listBox) || listBox is null || listBox.SelectedItems.Count == 0)
        {
            return false;
        }

        var selected = new List<ActionStep>();
        foreach (var item in listBox.SelectedItems)
        {
            if (TryExtractActionStep(item) is { } step)
            {
                selected.Add(step);
            }
        }

        steps = selected;
        return selected.Count > 0;
    }

    internal static ActionStep? TryExtractActionStep(object? item)
    {
        if (item is ActionStep step)
        {
            return step;
        }

        if (item is null)
        {
            return null;
        }

        return item.GetType().GetProperty("Step", InstanceAll)?.GetValue(item) as ActionStep;
    }

    public static bool TryRefreshDesignerUi(Window designer)
    {
        if (designer is null)
        {
            return false;
        }

        try
        {
            TryRefreshDesignerUi(designer, designer.GetType());
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryGetActiveStepListBox(Window designer, out ListBox? listBox)
    {
        listBox = null;
        if (!TryGetActiveStepListControl(designer, out var stepListControl) || stepListControl is null)
        {
            return false;
        }

        listBox = stepListControl.GetType().GetField("TheListBox", InstanceAll)?.GetValue(stepListControl) as ListBox;
        return listBox is not null;
    }

    private static bool TryGetActiveStepListControl(Window designer, out object? stepListControl)
    {
        stepListControl = null;
        if (!TryGetActionStepsWrapper(designer, out var wrapper) || wrapper is null)
        {
            return false;
        }

        var method = wrapper.GetType().GetMethod(
            "GetSelectedStepList",
            InstanceAll,
            binder: null,
            Type.EmptyTypes,
            modifiers: null);
        stepListControl = method?.Invoke(wrapper, null)
            ?? wrapper.GetType().GetField("ActionStepList", InstanceAll)?.GetValue(wrapper);
        return stepListControl is not null;
    }

    private const string StepsClipboardFormat = "quicker-action-steps";

    public static bool TryInvokeStepListCopy(Window designer, out string? error)
    {
        error = null;
        if (!TryGetSelectedSteps(designer, out var steps) || steps.Count == 0)
        {
            error = "请先选中要复制的步骤。";
            return false;
        }

        if (!TryGetActionStepsWrapper(designer, out var wrapper) || wrapper is null)
        {
            error = "未找到步骤列表。";
            return false;
        }

        if (!TryInvokeWrapperStepCommand(wrapper, "ExecuteCopySteps"))
        {
            error = "复制步骤失败。";
            return false;
        }

        var clip = ClipboardSpecialFormatService.Read(StepsClipboardFormat);
        if (!clip.Success)
        {
            error = clip.ErrorMessage ?? "读取剪贴板失败。";
            return false;
        }

        if (!clip.HasData || string.IsNullOrWhiteSpace(clip.Text))
        {
            error = "复制失败（剪贴板未写入步骤数据）。";
            return false;
        }

        return true;
    }

    public static bool TryInvokeStepListPaste(Window designer, out string? error)
    {
        error = null;
        if (!TryGetClipboardStepCount(out var stepCount, out error))
        {
            return false;
        }

        if (!TryGetActionStepsWrapper(designer, out var wrapper) || wrapper is null)
        {
            error = "未找到步骤列表。";
            return false;
        }

        if (!TryGetActiveStepListControl(designer, out var stepListControl) || stepListControl is null)
        {
            error = "未找到当前步骤列表。";
            return false;
        }

        var beforeCount = TryGetStepListNodeCount(stepListControl);

        if (!TryInvokeWrapperStepCommand(wrapper, "ExecutePasteSteps"))
        {
            error = "粘贴步骤失败。";
            return false;
        }

        var afterCount = TryGetStepListNodeCount(stepListControl);
        if (beforeCount >= 0 && afterCount >= 0 && afterCount <= beforeCount)
        {
            error = $"粘贴未生效（剪贴板含 {stepCount} 个步骤，请确认当前列表可编辑）。";
            return false;
        }

        return true;
    }

    private static bool TryInvokeWrapperStepCommand(object wrapper, string methodName)
    {
        var method = wrapper.GetType().GetMethod(methodName, InstanceAll, null, Type.EmptyTypes, null);
        if (method is null)
        {
            return false;
        }

        try
        {
            method.Invoke(wrapper, null);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryGetClipboardStepCount(out int stepCount, out string? error)
    {
        stepCount = 0;
        error = null;
        var clip = ClipboardSpecialFormatService.Read(StepsClipboardFormat);
        if (!clip.Success)
        {
            error = clip.ErrorMessage ?? "读取剪贴板失败。";
            return false;
        }

        if (!clip.HasData || string.IsNullOrWhiteSpace(clip.Text))
        {
            error = "剪贴板中没有步骤数据。";
            return false;
        }

        try
        {
            var stepsToken = JObject.Parse(clip.Text)["Steps"];
            if (stepsToken is not JArray steps || steps.Count == 0)
            {
                error = "要粘贴的步骤数量为 0。";
                return false;
            }

            stepCount = steps.Count;
            return true;
        }
        catch (Exception ex)
        {
            error = "剪贴板步骤数据格式不正确：" + ex.Message;
            return false;
        }
    }

    private static int TryGetStepListNodeCount(object stepListControl)
    {
        try
        {
            var field = stepListControl.GetType().GetField("_stepList", InstanceAll);
            if (field?.GetValue(stepListControl) is System.Collections.ICollection collection)
            {
                return collection.Count;
            }
        }
        catch
        {
            // Best-effort count for paste verification.
        }

        return -1;
    }

    public static bool TryUnlockReadOnly(Window designer, out bool changed, out string? error)
    {
        changed = false;
        error = null;
        if (designer is null)
        {
            error = "Designer window is null.";
            return false;
        }

        try
        {
            var winType = designer.GetType();
            var isReadonlyProp = winType.GetProperty("IsReadonly", InstanceAll);
            var limitationProp = winType.GetProperty("Limitation", InstanceAll);
            if (isReadonlyProp is null || limitationProp is null)
            {
                error = "Designer readonly API not found.";
                return false;
            }

            var wasReadonly = isReadonlyProp.GetValue(designer) is true;
            var limitation = limitationProp.GetValue(designer) is ActionUserLimitation value
                ? value
                : ActionUserLimitation.None;
            var itemLimited = TryClearActionItemLimitation(designer, winType);

            if (!wasReadonly && limitation == ActionUserLimitation.None && !itemLimited)
            {
                return true;
            }

            isReadonlyProp.SetValue(designer, false);
            limitationProp.SetValue(designer, ActionUserLimitation.None);
            TryClearActionItemLimitation(designer, winType);
            TryRefreshDesignerUi(designer, winType);
            changed = true;
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool TryClearActionItemLimitation(Window designer, Type winType)
    {
        var changed = false;
        foreach (var name in new[] { "EditingActionItem", "ResultActionItem", "EditingActionItem2", "ResultActionItem2" })
        {
            var item = winType.GetProperty(name, InstanceAll)?.GetValue(designer);
            if (item is null)
            {
                continue;
            }

            var limitationProp = item.GetType().GetProperty("UserLimitation", InstanceAll);
            if (limitationProp is null || !limitationProp.CanWrite)
            {
                continue;
            }

            if (limitationProp.GetValue(item) is ActionUserLimitation current && current != ActionUserLimitation.None)
            {
                limitationProp.SetValue(item, ActionUserLimitation.None);
                changed = true;
            }
        }

        return changed;
    }

    private static void TryRefreshDesignerUi(Window designer, Type winType)
    {
        QuickerActionDesignerReflection.TryInvokeUpdateXActionUi(designer, out _);

        if (winType.GetField("BtnSave", InstanceAll)?.GetValue(designer) is System.Windows.Controls.Button saveBtn)
        {
            saveBtn.IsEnabled = true;
        }
    }

    public static bool TryGetDesignerVariables(Window designer, out IReadOnlyList<ActionVariable> variables)
    {
        variables = Array.Empty<ActionVariable>();
        if (!TryGetActionProperty(designer, out var xActionObj) || xActionObj is null)
        {
            return false;
        }

        if (xActionObj is XAction xAction)
        {
            variables = xAction.Variables?
                .Where(v => !string.IsNullOrWhiteSpace(v.Key))
                .ToList() ?? new List<ActionVariable>();
            return true;
        }

        var variablesProp = xActionObj.GetType().GetProperty("Variables", InstanceAll);
        if (variablesProp?.GetValue(xActionObj) is not System.Collections.IEnumerable enumerable)
        {
            return false;
        }

        var result = new List<ActionVariable>();
        foreach (var item in enumerable)
        {
            if (item is ActionVariable variable)
            {
                if (!string.IsNullOrWhiteSpace(variable.Key))
                {
                    result.Add(variable);
                }

                continue;
            }

            if (item is null)
            {
                continue;
            }

            var key = item.GetType().GetProperty("Key", InstanceAll)?.GetValue(item) as string;
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var saveState = item.GetType().GetProperty("SaveState", InstanceAll)?.GetValue(item) is true;
            result.Add(new ActionVariable
            {
                Key = key.Trim(),
                SaveState = saveState,
            });
        }

        variables = result;
        return true;
    }

    public static bool TryGetSelectedVariableKeys(Window designer, out string[] keys)
    {
        if (!TryGetSelectedVariables(designer, out var variables) || variables.Count == 0)
        {
            keys = Array.Empty<string>();
            return false;
        }

        keys = variables
            .Select(v => v.Key?.Trim())
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k!)
            .ToArray();
        return keys.Length > 0;
    }

    public static bool TryGetSelectedVariables(Window designer, out IReadOnlyList<ActionVariable> variables)
    {
        variables = Array.Empty<ActionVariable>();
        if (!TryGetVariableListControl(designer, out var control) || control is null)
        {
            return false;
        }

        var listBox = control.GetType().GetField("LbVariables", InstanceAll)?.GetValue(control)
            as System.Windows.Controls.ListBox;
        if (listBox?.SelectedItems is null || listBox.SelectedItems.Count == 0)
        {
            return false;
        }

        var result = new List<ActionVariable>();
        foreach (var item in listBox.SelectedItems)
        {
            if (item is ActionVariable variable)
            {
                result.Add(variable);
                continue;
            }

            if (item is null)
            {
                continue;
            }

            var key = item.GetType().GetProperty("Key", InstanceAll)?.GetValue(item) as string;
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            var saveState = item.GetType().GetProperty("SaveState", InstanceAll)?.GetValue(item) is true;
            result.Add(new ActionVariable
            {
                Key = key.Trim(),
                SaveState = saveState,
            });
        }

        variables = result;
        return result.Count > 0;
    }

    private static bool TryGetField(object target, string fieldName, out object? value)
    {
        value = null;
        if (target is null)
        {
            return false;
        }

        var field = target.GetType().GetField(fieldName, InstanceAll);
        if (field is null)
        {
            return false;
        }

        value = field.GetValue(target);
        return true;
    }

    private static Type? ResolveQuickerType(string fullName)
    {
        var entry = Assembly.GetEntryAssembly();
        if (entry is not null)
        {
            var fromEntry = entry.GetType(fullName, throwOnError: false, ignoreCase: false);
            if (fromEntry is not null)
            {
                return fromEntry;
            }
        }

        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            var t = asm.GetType(fullName, throwOnError: false, ignoreCase: false);
            if (t is not null)
            {
                return t;
            }
        }

        return null;
    }
}
