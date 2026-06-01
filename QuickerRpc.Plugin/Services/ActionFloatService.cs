using System;
using System.Reflection;
using System.Windows;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Shows a local Quicker action as a floating button via ActionEditMgr.FloatAction (reflection).
/// </summary>
public sealed class ActionFloatService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;

    public ActionFloatService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
    }

    public QuickerRpcFloatActionResult FloatAction(string actionId)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                Message = "actionId is required.",
            };
        }

        if (_actionEditMgr is null)
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = "Not running inside Quicker (ActionEditMgr unavailable).",
            };
        }

        if (!ActionContextResolver.TryResolve(id, out _, out var actionObj, out var resolveError))
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = resolveError ?? $"Action not found: {id}",
            };
        }

        if (actionObj is not ActionItem actionItem)
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = id,
                Message = "Resolved action is not an ActionItem.",
            };
        }

        var actionTitle = ReadActionTitle(actionItem);
        var resolvedId = actionItem.Id.ToString();

        if (!CanFloat(actionItem))
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = resolvedId,
                ActionTitle = actionTitle,
                Message = "此动作不支持悬浮。",
            };
        }

        if (!TryCanUseFloating(out var floatingLimitMessage))
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = resolvedId,
                ActionTitle = actionTitle,
                Message = floatingLimitMessage ?? "当前无法使用悬浮按钮（版本或数量限制）。",
            };
        }

        var ownerWindow = Application.Current?.MainWindow;
        if (ownerWindow is null)
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = resolvedId,
                ActionTitle = actionTitle,
                Message = "No WPF main window available for FloatAction.",
            };
        }

        if (!_actionEditMgr.TryFloatAction(actionItem, ownerWindow, out var floatError))
        {
            return new QuickerRpcFloatActionResult
            {
                Ok = false,
                ActionId = resolvedId,
                ActionTitle = actionTitle,
                Message = floatError ?? "FloatAction failed.",
            };
        }

        return new QuickerRpcFloatActionResult
        {
            Ok = true,
            ActionId = resolvedId,
            ActionTitle = actionTitle,
            Message = string.IsNullOrWhiteSpace(actionTitle)
                ? "动作已显示为悬浮按钮。"
                : $"动作已显示为悬浮按钮：{actionTitle}",
        };
    }

    private static bool CanFloat(ActionItem action) =>
        action.ActionType != ActionType.Empty
        && action.ActionType != ActionType.GoParent
        && action.ActionType != ActionType.Folder;

    private static bool TryCanUseFloating(out string? limitMessage)
    {
        limitMessage = null;
        try
        {
            var dataService = AppState.DataService;
            if (dataService is null)
            {
                return false;
            }

            var canUseFloating = dataService.GetType().GetMethod(
                "CanUseFloating",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic,
                binder: null,
                types: new[] { typeof(bool) },
                modifiers: null);
            if (canUseFloating is null)
            {
                return true;
            }

            var canUse = canUseFloating.Invoke(dataService, new object[] { false });
            if (canUse is true)
            {
                return true;
            }

            var showLimit = dataService.GetType().GetMethod(
                "ShowFloatButtonLimitWarning",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (showLimit is not null)
            {
                // Quicker shows its own dialog; RPC returns a stable message for agents.
                limitMessage =
                    "悬浮按钮为专业版功能。免费版可悬浮 1 个按钮；若已有绑定进程的悬浮按钮，请从托盘菜单关闭后再试。";
            }
            else
            {
                limitMessage = "当前无法创建更多悬浮按钮。";
            }

            return false;
        }
        catch
        {
            return true;
        }
    }

    private static string? ReadActionTitle(ActionItem actionItem)
    {
        var presentation = actionItem.GetType().GetProperty("Presentation")?.GetValue(actionItem);
        var fromPresentation = presentation?.GetType().GetProperty("Title")?.GetValue(presentation) as string;
        if (!string.IsNullOrWhiteSpace(fromPresentation))
        {
            return fromPresentation;
        }

        return actionItem.GetType().GetProperty("Title")?.GetValue(actionItem) as string;
    }
}
