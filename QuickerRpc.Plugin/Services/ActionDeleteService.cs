using System;
using System.Reflection;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Deletes local Quicker actions via ActionEditMgr (reflection, same approach as ActionUpdateService).
/// </summary>
public sealed class ActionDeleteService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;

    public ActionDeleteService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
    }

    public async Task<QuickerRpcActionUpdateResult> DeleteActionAsync(string actionId, bool showConfirm)
    {
        if (_actionEditMgr?.DeleteAction is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = "Not running inside Quicker (ActionEditMgr unavailable).",
            };
        }

        if (!ActionContextResolver.TryResolve(actionId, out var pageOrProfile, out var action, out var errorMessage))
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = errorMessage ?? $"Action not found: {actionId}",
            };
        }

        try
        {
            var pending = _actionEditMgr.DeleteAction.Invoke(
                _actionEditMgr.Instance,
                new object[] { pageOrProfile, action, showConfirm, false });
            if (pending is not Task task)
            {
                return new QuickerRpcActionUpdateResult
                {
                    Ok = false,
                    ActionId = actionId,
                    Message = "DeleteAction did not return Task.",
                };
            }

            await task.ConfigureAwait(true);
            var deleted = ReadTaskBoolResult(task);
            return new QuickerRpcActionUpdateResult
            {
                Ok = deleted,
                ActionId = actionId,
                Message = deleted ? "动作已删除。" : "删除动作已取消或失败。",
            };
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = ex.InnerException.Message,
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = ex.Message,
            };
        }
    }

    private static bool ReadTaskBoolResult(Task completedTask)
    {
        var resultProperty = completedTask.GetType().GetProperty("Result");
        return resultProperty?.GetValue(completedTask) is bool value && value;
    }
}
