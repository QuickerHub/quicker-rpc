using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using Quicker.Domain.Actions.X.Storage;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads and writes <c>sys:subprogram</c> target identifiers on selected designer steps.
/// </summary>
internal static class ActionDesignerSubProgramId
{
    internal const string SubProgramRunnerKey = "sys:subprogram";
    internal const string SubProgramParamKey = "subProgram";

    public static bool TryGetSelectedSubProgramSteps(
        Window designer,
        out IReadOnlyList<ActionStep> steps,
        out string? error)
    {
        steps = Array.Empty<ActionStep>();
        error = null;

        if (!ActionDesignerReflection.TryGetSelectedSteps(designer, out var selected) || selected.Count == 0)
        {
            error = "请先选中「运行子程序」步骤。";
            return false;
        }

        var subProgramSteps = new List<ActionStep>();
        var skippedVariableBound = false;
        var skippedNonSubProgram = false;
        foreach (var step in selected)
        {
            if (!IsSubProgramStep(step))
            {
                skippedNonSubProgram = true;
                continue;
            }

            if (IsVariableBoundSubProgramStep(step))
            {
                skippedVariableBound = true;
                continue;
            }

            subProgramSteps.Add(step);
        }

        if (subProgramSteps.Count == 0)
        {
            if (skippedVariableBound)
            {
                error = "选中步骤的子程序参数为变量引用，无法修改固定目标。";
            }
            else if (skippedNonSubProgram)
            {
                error = "选中步骤中没有「运行子程序」步骤。";
            }
            else
            {
                error = "请先选中「运行子程序」步骤。";
            }

            return false;
        }

        steps = subProgramSteps;
        return true;
    }

    public static bool TryGetSelectedSubProgramIds(Window designer, out string text, out string? error)
    {
        text = string.Empty;
        error = null;

        if (!ActionDesignerReflection.TryGetSelectedSteps(designer, out var steps) || steps.Count == 0)
        {
            error = "请先选中「运行子程序」步骤。";
            return false;
        }

        var ids = new List<string>();
        var skippedVariableBound = false;
        foreach (var step in steps)
        {
            if (!TryReadSubProgramReference(step, out var reference, out var variableBound))
            {
                if (variableBound)
                {
                    skippedVariableBound = true;
                }

                continue;
            }

            ids.Add(reference!);
        }

        if (ids.Count == 0)
        {
            error = skippedVariableBound
                ? "选中步骤的子程序参数为变量引用，无法读取固定 ID。"
                : "选中步骤中没有子程序引用（需为「运行子程序」步骤）。";
            return false;
        }

        text = string.Join(Environment.NewLine, ids);
        return true;
    }

    public static bool TryGetInitialPickerText(IReadOnlyList<ActionStep> steps, out string text)
    {
        var references = steps
            .Select(step =>
            {
                return TryReadSubProgramReference(step, out var reference, out _)
                    ? reference?.Trim()
                    : null;
            })
            .Where(reference => !string.IsNullOrWhiteSpace(reference))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (references.Count == 1)
        {
            text = ActionDesignerSubProgramTargetSearch.GetSearchKeywordFromReference(references[0]);
            return text.Length > 0;
        }

        text = string.Empty;
        return false;
    }

    public static bool TrySetSubProgramReference(ActionStep step, string reference)
    {
        var value = (reference ?? string.Empty).Trim();
        if (value.Length == 0)
        {
            return false;
        }

        step.InputParams ??= new Dictionary<string, ActionStepParam>(StringComparer.OrdinalIgnoreCase);
        if (!step.InputParams.TryGetValue(SubProgramParamKey, out var param) || param is null)
        {
            param = new ActionStepParam();
            step.InputParams[SubProgramParamKey] = param;
        }

        param.VarKey = string.Empty;
        param.Value = value;
        return true;
    }

    internal static bool TryReadSubProgramReference(
        ActionStep step,
        out string? reference,
        out bool variableBound)
    {
        reference = null;
        variableBound = false;
        if (!IsSubProgramStep(step))
        {
            return false;
        }

        if (step.InputParams is null)
        {
            return false;
        }

        ActionStepParam? param = null;
        foreach (var pair in step.InputParams)
        {
            if (string.Equals(pair.Key, SubProgramParamKey, StringComparison.OrdinalIgnoreCase))
            {
                param = pair.Value;
                break;
            }
        }

        if (param is null)
        {
            return false;
        }

        if (!string.IsNullOrWhiteSpace(param.VarKey))
        {
            variableBound = true;
            return false;
        }

        reference = param.Value?.Trim();
        return !string.IsNullOrWhiteSpace(reference);
    }

    private static bool IsSubProgramStep(ActionStep step) =>
        string.Equals(step.StepRunnerKey?.Trim(), SubProgramRunnerKey, StringComparison.OrdinalIgnoreCase);

    private static bool IsVariableBoundSubProgramStep(ActionStep step)
    {
        if (!IsSubProgramStep(step) || step.InputParams is null)
        {
            return false;
        }

        foreach (var pair in step.InputParams)
        {
            if (!string.Equals(pair.Key, SubProgramParamKey, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return !string.IsNullOrWhiteSpace(pair.Value?.VarKey);
        }

        return false;
    }
}
