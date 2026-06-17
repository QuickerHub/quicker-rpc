using System.Linq;
using System.Windows;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Changes <c>inputParams.subProgram</c> on selected sys:subprogram designer steps.
/// </summary>
internal static class ActionDesignerSubProgramTargetChange
{
    public static void TryChangeSelected(Window designer)
    {
        if (!ActionDesignerSubProgramId.TryGetSelectedSubProgramSteps(designer, out var steps, out var error))
        {
            PopupMessage.Warning(error ?? "无法读取选中的子程序步骤。");
            return;
        }

        ActionDesignerSubProgramId.TryGetInitialPickerText(steps, out var initialText);
        if (!ActionDesignerSubProgramTargetPickerWindow.TryPick(designer, initialText, out var callIdentifier)
            || string.IsNullOrWhiteSpace(callIdentifier))
        {
            return;
        }

        var changed = 0;
        foreach (var step in steps)
        {
            if (ActionDesignerSubProgramId.TrySetSubProgramReference(step, callIdentifier))
            {
                changed++;
            }
        }

        if (changed == 0)
        {
            PopupMessage.Warning("未能修改子程序目标。");
            return;
        }

        ActionDesignerReflection.TryRefreshDesignerUi(designer);
        PopupMessage.Success(changed == 1
            ? $"已修改 1 处子程序目标：{callIdentifier}"
            : $"已修改 {changed} 处子程序目标：{callIdentifier}");
    }
}
