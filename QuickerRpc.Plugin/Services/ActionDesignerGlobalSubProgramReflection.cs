using System;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Quicker.Domain;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>Reflection helpers for <c>ActionDesignerWindow.GlobalSubProgramsList</c>.</summary>
internal static class ActionDesignerGlobalSubProgramReflection
{
    private const string GlobalSubProgramListField = "GlobalSubProgramsList";
    private const string SubProgramListBoxField = "LvSubprograms";

    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static Type? _globalSubProgramListControlType;

    public static Type? GlobalSubProgramListControlType =>
        _globalSubProgramListControlType ??= ResolveGlobalSubProgramListControlType();

    public static bool TryGetSubProgramListBox(Window designer, out ListBox? listBox)
    {
        listBox = null;
        if (!ActionDesignerReflection.IsDesignerWindow(designer))
        {
            return false;
        }

        if (TryGetSubProgramListBoxFromControlObject(designer, out listBox))
        {
            return true;
        }

        listBox = FindGlobalSubProgramListBoxInVisualTree(designer);
        return listBox is not null;
    }

    public static bool TryGetSubProgramListBoxFromControlObject(object root, out ListBox? listBox)
    {
        listBox = null;
        if (!TryGetField(root, GlobalSubProgramListField, out var listControl) || listControl is null)
        {
            return false;
        }

        return TryGetSubProgramListBoxFromControl(listControl, out listBox);
    }

    public static bool TryGetSubProgramListBoxFromControl(object listControl, out ListBox? listBox)
    {
        listBox = null;
        if (!TryGetField(listControl, SubProgramListBoxField, out var value))
        {
            return false;
        }

        listBox = value as ListBox;
        return listBox is not null;
    }

    public static bool IsDescendantOf(DependencyObject? ancestor, DependencyObject? node)
    {
        if (ancestor is null || node is null)
        {
            return false;
        }

        for (var current = node; current is not null; current = VisualTreeHelper.GetParent(current))
        {
            if (ReferenceEquals(current, ancestor))
            {
                return true;
            }
        }

        return false;
    }

    public static bool TryOpenGlobalSubProgramEditor(SubProgram subProgram, out string? error)
    {
        error = null;
        var mgr = ActionEditMgrAccessor.TryCreate();
        if (mgr?.CreateOrEditGlobalSubProgram is null)
        {
            error = "CreateOrEditGlobalSubProgram unavailable.";
            return false;
        }

        try
        {
            mgr.CreateOrEditGlobalSubProgram.Invoke(mgr.Instance, new object[] { subProgram });
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryOpenActionEditor(string actionId, out string? error)
    {
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "Action id is required.";
            return false;
        }

        try
        {
            AppState.AppServer.EditActionById(id);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryGetSelectedSubProgram(ListBox listBox, out SubProgram? subProgram)
    {
        subProgram = null;
        if (listBox.SelectedItem is SubProgram selected)
        {
            subProgram = selected;
            return true;
        }

        if (listBox.SelectedItem is null)
        {
            return false;
        }

        subProgram = listBox.SelectedItem.GetType().GetProperty("SubProgram", InstanceAll)?.GetValue(listBox.SelectedItem)
            as SubProgram;
        return subProgram is not null;
    }

    public static bool TryGetSubProgramFromItem(ListBoxItem item, out SubProgram? subProgram)
    {
        subProgram = null;
        if (item.DataContext is SubProgram direct)
        {
            subProgram = direct;
            return true;
        }

        if (item.DataContext is null)
        {
            return false;
        }

        subProgram = item.DataContext.GetType().GetProperty("SubProgram", InstanceAll)?.GetValue(item.DataContext)
            as SubProgram;
        return subProgram is not null;
    }

    private static ListBox? FindGlobalSubProgramListBoxInVisualTree(DependencyObject root)
    {
        var controlType = GlobalSubProgramListControlType;
        if (controlType is null)
        {
            return null;
        }

        return WalkVisualTree(root, controlType);
    }

    private static ListBox? WalkVisualTree(DependencyObject node, Type controlType)
    {
        if (controlType.IsInstanceOfType(node)
            && TryGetSubProgramListBoxFromControl(node, out var listBox))
        {
            return listBox;
        }

        var childCount = VisualTreeHelper.GetChildrenCount(node);
        for (var i = 0; i < childCount; i++)
        {
            var found = WalkVisualTree(VisualTreeHelper.GetChild(node, i), controlType);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    private static Type? ResolveGlobalSubProgramListControlType()
    {
        var designerType = ActionDesignerReflection.DesignerWindowType;
        if (designerType is null)
        {
            return null;
        }

        return designerType.GetField(GlobalSubProgramListField, InstanceAll)?.FieldType;
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
}
