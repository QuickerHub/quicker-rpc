using System;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runtime;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Runs a local Quicker action via AppState.AppServer.ExecuteActionByIdOrName (reflection).
/// </summary>
public sealed class ActionRunService
{
    private readonly Func<string, string?, bool, bool, QuickerRpcActionRunResult>? _run;

    public ActionRunService()
    {
        _run = TryCreateRunDelegate();
    }

    public QuickerRpcActionRunResult RunAction(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                Message = "actionId is required.",
            };
        }

        if (_run is null)
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = id,
                Message = "Not running inside Quicker (ExecuteActionByIdOrName unavailable).",
            };
        }

        try
        {
            return _run(id, inputParam, enableDebugging, waitForComplete);
        }
        catch (Exception ex)
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = id,
                Message = ex.Message,
                ErrorMessage = ex.Message,
            };
        }
    }

    private static Func<string, string?, bool, bool, QuickerRpcActionRunResult>? TryCreateRunDelegate()
    {
        if (!IsInQuicker())
        {
            return null;
        }

        return TryCreateAppServerRunDelegate(out var fromAppServer) ? fromAppServer : null;
    }

    private static bool TryCreateAppServerRunDelegate(
        out Func<string, string?, bool, bool, QuickerRpcActionRunResult> run)
    {
        run = null!;

        try
        {
            var appServer = typeof(AppState).GetProperty("AppServer", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);
            if (appServer is null)
            {
                return false;
            }

            var method = appServer.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "ExecuteActionByIdOrName", StringComparison.Ordinal)
                    && m.GetParameters().Length >= 7
                    && m.GetParameters()[0].ParameterType == typeof(string));
            if (method is null)
            {
                return false;
            }

            var actionTriggerType = method.GetParameters()[6].ParameterType;
            if (!actionTriggerType.IsEnum)
            {
                return false;
            }

            var externTrigger = Enum.Parse(actionTriggerType, "Extern");

            run = (id, inputParam, enableDebugging, waitForComplete) =>
            {
                var args = BuildInvokeArgs(method, id, inputParam, enableDebugging, waitForComplete, externTrigger);
                var raw = method.Invoke(appServer, args);
                return MapExecuteResult(id, raw, waitForComplete);
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static object?[] BuildInvokeArgs(
        MethodInfo method,
        string id,
        string? inputParam,
        bool enableDebugging,
        bool waitForComplete,
        object externTrigger)
    {
        var parameters = method.GetParameters();
        var args = new object?[parameters.Length];
        args[0] = id;
        args[1] = null; // PointTargetInfo?
        args[2] = enableDebugging;
        args[3] = waitForComplete;
        args[4] = false; // isSubAction
        args[5] = inputParam ?? string.Empty;
        args[6] = externTrigger;

        for (var i = 7; i < parameters.Length; i++)
        {
            args[i] = parameters[i].HasDefaultValue ? parameters[i].DefaultValue : null;
        }

        return args;
    }

    private static QuickerRpcActionRunResult MapExecuteResult(string actionId, object? raw, bool waitForComplete)
    {
        if (raw is null)
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = actionId,
                Message = "ExecuteActionByIdOrName returned null.",
            };
        }

        UnpackExecuteResult(raw, out var actionItem, out var context, out var errorMessage);

        if (!string.IsNullOrWhiteSpace(errorMessage))
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = actionId,
                Message = errorMessage,
                ErrorMessage = errorMessage,
            };
        }

        if (actionItem is null)
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = actionId,
                Message = $"Action not found: {actionId}",
                ErrorMessage = $"Action not found: {actionId}",
            };
        }

        var title = ReadActionTitle(actionItem);
        var returnResult = ReadReturnResult(context);

        if (waitForComplete && TryReadExecutionFailure(context, out var runtimeError, out var stopFlag))
        {
            return new QuickerRpcActionRunResult
            {
                Ok = false,
                ActionId = actionId,
                ActionTitle = title,
                ReturnResult = returnResult,
                ErrorMessage = runtimeError,
                StopFlag = stopFlag,
                Message = runtimeError ?? "动作执行失败。",
            };
        }

        return new QuickerRpcActionRunResult
        {
            Ok = true,
            ActionId = actionId,
            ActionTitle = title,
            ReturnResult = returnResult,
            Message = string.IsNullOrWhiteSpace(returnResult)
                ? waitForComplete ? "动作已运行。" : "动作已启动。"
                : returnResult,
        };
    }

    private static bool TryReadExecutionFailure(
        object? context,
        out string? errorMessage,
        out string? stopFlag)
    {
        errorMessage = null;
        stopFlag = null;

        if (context is ActionExecuteContext typed)
        {
            return TryReadExecutionFailure(typed, out errorMessage, out stopFlag);
        }

        if (context is null)
        {
            return false;
        }

        var returnError = ReadBoolProperty(context, "ReturnError") == true;
        var flagText = ReadEnumPropertyName(context, "StopFlag");
        var contextError = ReadStringProperty(context, "ErrorMessage");

        if (!returnError && (string.IsNullOrWhiteSpace(flagText) || string.Equals(flagText, "NoStop", StringComparison.Ordinal)))
        {
            return false;
        }

        stopFlag = string.IsNullOrWhiteSpace(flagText) ? null : flagText;
        errorMessage = !string.IsNullOrWhiteSpace(contextError)
            ? contextError
            : DescribeStopFlag(stopFlag);
        return true;
    }

    private static bool TryReadExecutionFailure(
        ActionExecuteContext context,
        out string? errorMessage,
        out string? stopFlag)
    {
        errorMessage = null;
        stopFlag = null;

        if (!context.ReturnError && context.StopFlag == ActionStopFlag.NoStop)
        {
            return false;
        }

        stopFlag = context.StopFlag.ToString();
        errorMessage = !string.IsNullOrWhiteSpace(context.ErrorMessage)
            ? context.ErrorMessage
            : DescribeStopFlag(stopFlag);
        return true;
    }

    private static string DescribeStopFlag(string? stopFlag) =>
        stopFlag switch
        {
            nameof(ActionStopFlag.OperationFailed) => "动作执行失败。",
            nameof(ActionStopFlag.UserCancel) => "动作已被用户取消。",
            nameof(ActionStopFlag.ForceStop) => "动作已被强制停止。",
            nameof(ActionStopFlag.StopFromCode) => "动作被停止模块终止。",
            _ => "动作未成功完成。",
        };

    private static void UnpackExecuteResult(
        object tuple,
        out object? actionItem,
        out object? context,
        out string errorMessage)
    {
        var t = tuple.GetType();
        actionItem = t.GetField("actionItem")?.GetValue(tuple) ?? t.GetField("Item1")?.GetValue(tuple);
        context = t.GetField("context")?.GetValue(tuple) ?? t.GetField("Item2")?.GetValue(tuple);
        errorMessage = (t.GetField("errorMessage")?.GetValue(tuple) ?? t.GetField("Item3")?.GetValue(tuple)) as string
            ?? string.Empty;
    }

    private static string? ReadActionTitle(object actionItem)
    {
        var presentation = actionItem.GetType().GetProperty("Presentation")?.GetValue(actionItem);
        var fromPresentation = presentation?.GetType().GetProperty("Title")?.GetValue(presentation) as string;
        if (!string.IsNullOrWhiteSpace(fromPresentation))
        {
            return fromPresentation;
        }

        return actionItem.GetType().GetProperty("Title")?.GetValue(actionItem) as string;
    }

    private static string? ReadReturnResult(object? context)
    {
        if (context is null)
        {
            return null;
        }

        if (context is ActionExecuteContext typed)
        {
            return string.IsNullOrWhiteSpace(typed.ReturnResult) ? null : typed.ReturnResult;
        }

        var value = context.GetType().GetProperty("ReturnResult")?.GetValue(context) as string;
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string? ReadStringProperty(object instance, string propertyName)
    {
        try
        {
            return instance.GetType()
                .GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(instance) as string;
        }
        catch
        {
            return null;
        }
    }

    private static bool? ReadBoolProperty(object instance, string propertyName)
    {
        try
        {
            var value = instance.GetType()
                .GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(instance);
            return value is bool typed ? typed : null;
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadEnumPropertyName(object instance, string propertyName)
    {
        try
        {
            var value = instance.GetType()
                .GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)
                ?.GetValue(instance);
            return value?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static bool IsInQuicker() =>
        Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
}
