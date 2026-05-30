using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Quicker.Domain;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Updates shared actions via Quicker's ActionEditMgr (same approach as wpf-demos/quicker-modifier).
/// Uses reflection because ActionEditMgr is internal to Quicker.exe.
/// </summary>
public sealed class ActionUpdateService
{
    private readonly object? _actionEditMgr;
    private readonly MethodInfo? _updateSharedActionAsyncMethod;

    public ActionUpdateService()
    {
        _actionEditMgr = TryGetActionEditMgr(out var updateMethod);
        _updateSharedActionAsyncMethod = updateMethod;
    }

    public async Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(string actionId, string changeLog)
    {
        if (_actionEditMgr is null || _updateSharedActionAsyncMethod is null)
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
            var pending = _updateSharedActionAsyncMethod.Invoke(_actionEditMgr, new object[] { actionId, changeLog });
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

    private static object? TryGetActionEditMgr(out MethodInfo? updateSharedActionAsyncMethod)
    {
        updateSharedActionAsyncMethod = null;
        if (!IsInQuicker())
        {
            return null;
        }

        try
        {
            var mgrType = typeof(AppState).Assembly.GetType("Quicker.Domain.Services.ActionEditMgr", throwOnError: false);
            if (mgrType is null)
            {
                return null;
            }

            var mgr = typeof(AppState).GetMethods(BindingFlags.NonPublic | BindingFlags.Static)
                .FirstOrDefault(x => x.ReturnType == mgrType)
                ?.Invoke(null, null);
            if (mgr is null)
            {
                return null;
            }

            updateSharedActionAsyncMethod = mgrType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "UpdateSharedActionAsync", StringComparison.Ordinal)
                    && m.ReturnType.IsGenericType
                    && m.GetParameters().Length == 2
                    && m.GetParameters()[0].ParameterType == typeof(string)
                    && m.GetParameters()[1].ParameterType == typeof(string));

            return updateSharedActionAsyncMethod is null ? null : mgr;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsInQuicker()
    {
        return Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
    }
}
