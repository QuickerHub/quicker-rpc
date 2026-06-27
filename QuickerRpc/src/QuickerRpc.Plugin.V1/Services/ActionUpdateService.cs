using System;
using System.Reflection;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Updates shared actions via Quicker's ActionEditMgr (same approach as wpf-demos/quicker-modifier).
/// Uses reflection because ActionEditMgr is internal to Quicker.exe.
/// </summary>
public sealed class ActionUpdateService
{
    private readonly ActionEditMgrAccessor? _actionEditMgr;

    public ActionUpdateService()
    {
        _actionEditMgr = ActionEditMgrAccessor.TryCreate();
    }

    public async Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(string actionId, string changeLog)
    {
        if (_actionEditMgr?.UpdateSharedActionAsync is null)
        {
            return new QuickerRpcActionUpdateResult
            {
                Ok = false,
                ActionId = actionId,
                Message = "Not running inside Quicker (ActionEditMgr unavailable).",
            };
        }

        try
        {
            var pending = _actionEditMgr.UpdateSharedActionAsync.Invoke(
                _actionEditMgr.Instance,
                new object[] { actionId, changeLog });
            if (pending is not Task task)
            {
                return new QuickerRpcActionUpdateResult
                {
                    Ok = false,
                    ActionId = actionId,
                    Message = "UpdateSharedActionAsync did not return Task.",
                };
            }

            await task.ConfigureAwait(true);
            var (isSuccess, message) = ReadValueTupleBoolString(task);
            return new QuickerRpcActionUpdateResult
            {
                Ok = isSuccess,
                ActionId = actionId,
                Message = message ?? string.Empty,
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

    private static (bool IsSuccess, string? Message) ReadValueTupleBoolString(Task completedTask)
    {
        var resultProperty = completedTask.GetType().GetProperty("Result");
        if (resultProperty is null)
        {
            return (false, "Task has no Result property.");
        }

        var value = resultProperty.GetValue(completedTask);
        if (value is null)
        {
            return (false, "UpdateSharedActionAsync returned null.");
        }

        var valueType = value.GetType();
        if (!valueType.IsGenericType || valueType.GetGenericTypeDefinition().FullName != "System.ValueTuple`2")
        {
            return (false, $"Unexpected result type: {valueType.FullName}");
        }

        var item1 = valueType.GetField("Item1")?.GetValue(value);
        var item2 = valueType.GetField("Item2")?.GetValue(value);
        return (item1 is bool ok && ok, item2 as string);
    }
}
