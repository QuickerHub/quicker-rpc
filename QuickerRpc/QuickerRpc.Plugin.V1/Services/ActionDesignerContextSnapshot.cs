using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Collects context of open <c>ActionDesignerWindow</c>s for the embedded QuickerAgent chat
/// (entity id, selected steps, optional XAction JSON). UI thread only.
/// </summary>
internal static class ActionDesignerContextSnapshot
{
    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static QuickerRpcDesignerContextResult Collect(bool includeXAction)
    {
        var result = new QuickerRpcDesignerContextResult { Ok = true };
        var windows = Application.Current?.Windows;
        if (windows is null)
        {
            result.Ok = false;
            result.Message = "WPF application is not available.";
            return result;
        }

        foreach (Window window in windows)
        {
            if (!ActionDesignerReflection.IsDesignerWindow(window))
            {
                continue;
            }

            result.Designers.Add(CollectWindow(window, includeXAction));
        }

        if (result.Designers.Count == 0)
        {
            result.Message = "No open ActionDesigner window.";
        }

        return result;
    }

    private static QuickerRpcDesignerWindowContext CollectWindow(Window designer, bool includeXAction)
    {
        var context = new QuickerRpcDesignerWindowContext
        {
            EntityId = ActionDesignerContext.TryReadDesignerEntityId(designer),
            IsSubProgram = ActionDesignerContext.IsSubProgramDesigner(designer),
            IsActive = designer.IsActive,
            Title = designer.Title,
        };

        if (includeXAction
            && ActionDesignerContext.TryExportXActionJson(designer, out var json, out _))
        {
            context.XActionJson = json;
        }

        try
        {
            CollectSelectedSteps(designer, context.SelectedSteps);
        }
        catch (Exception ex)
        {
            Trace.TraceWarning(
                "[QuickerRpc.Plugin] Designer selected steps snapshot failed: {0}",
                ex.Message);
        }

        return context;
    }

    private static void CollectSelectedSteps(Window designer, IList<QuickerRpcDesignerSelectedStep> target)
    {
        var stepList = TryGetActiveStepList(designer);
        if (stepList is null)
        {
            return;
        }

        if (stepList.GetType().GetField("TheListBox", InstanceAll)?.GetValue(stepList) is not ListBox listBox
            || listBox.SelectedItems.Count == 0)
        {
            return;
        }

        // Walk Items in order: SelectedItems ordering follows click order, not list order.
        for (var index = 0; index < listBox.Items.Count; index++)
        {
            var node = listBox.Items[index];
            if (node is null || !listBox.SelectedItems.Contains(node))
            {
                continue;
            }

            var step = node.GetType().GetProperty("Step", InstanceAll)?.GetValue(node);
            if (step is null)
            {
                continue;
            }

            target.Add(new QuickerRpcDesignerSelectedStep
            {
                Index = index,
                StepId = GetStringProperty(step, "StepId"),
                StepRunnerKey = GetStringProperty(step, "StepRunnerKey"),
                Note = GetStringProperty(step, "Note"),
                Disabled = step.GetType().GetProperty("Disabled", InstanceAll)?.GetValue(step) is true,
            });
        }
    }

    /// <summary>
    /// Active step list: wrapper.GetSelectedStepList() honors the focused subprogram tab;
    /// falls back to the main-program list field.
    /// </summary>
    private static object? TryGetActiveStepList(Window designer)
    {
        if (!ActionDesignerReflection.TryGetActionStepsWrapper(designer, out var wrapper) || wrapper is null)
        {
            return null;
        }

        var method = wrapper.GetType().GetMethod(
            "GetSelectedStepList",
            InstanceAll,
            binder: null,
            Type.EmptyTypes,
            modifiers: null);
        var fromMethod = method?.Invoke(wrapper, null);
        if (fromMethod is not null)
        {
            return fromMethod;
        }

        return wrapper.GetType().GetField("ActionStepList", InstanceAll)?.GetValue(wrapper);
    }

    private static string? GetStringProperty(object target, string name) =>
        target.GetType().GetProperty(name, InstanceAll)?.GetValue(target) as string;
}
