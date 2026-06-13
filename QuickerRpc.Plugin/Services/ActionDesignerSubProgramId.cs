using System;
using System.Collections.Generic;
using System.Windows;
using Quicker.Domain.Actions.X.Storage;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads <c>sys:subprogram</c> target identifiers from selected designer steps.
/// </summary>
internal static class ActionDesignerSubProgramId
{
    private const string SubProgramRunnerKey = "sys:subprogram";
    private const string SubProgramParamKey = "subProgram";

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

    private static bool TryReadSubProgramReference(
        ActionStep step,
        out string? reference,
        out bool variableBound)
    {
        reference = null;
        variableBound = false;
        if (!string.Equals(step.StepRunnerKey?.Trim(), SubProgramRunnerKey, StringComparison.OrdinalIgnoreCase))
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
}
