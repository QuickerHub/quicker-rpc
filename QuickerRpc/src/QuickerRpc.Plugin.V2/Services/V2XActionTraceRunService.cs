using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common.ActionPayloads.XAction;
using Quicker.Common.V2;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runner;
using Quicker.Domain.Actions.Runtime;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Debugging;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Services;

/// <summary>
/// Headless XAction trace on Quicker V2: <see cref="XActionRunner.ExecuteAction(ActionItem2, XActionDto, ActionExecuteContext)"/>
/// with <see cref="TerminalActionLogger"/> (no designer debugger UI).
/// </summary>
internal sealed class V2XActionTraceRunService
{
    private readonly QuickerV2ActionAccessor? _actions = QuickerV2ActionAccessor.Current;

    public QuickerRpcActionTraceRunResult RunAction(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        IQuickerRpcClientCallbacks? streamCallbacks = null)
    {
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Fail("actionId is required.");
        }

        if (!IsInQuicker())
        {
            return Fail("Not running inside Quicker.", id);
        }

        if (_actions is null || !_actions.IsAvailable)
        {
            return Fail(
                "Action services unavailable. " + QuickerV2Runtime.DescribeActionServiceProbe(),
                id);
        }

        if (!_actions.TryGetById(id, out var actionObj, out var loadError) || actionObj is null)
        {
            return Fail(loadError ?? $"Action not found: {id}", id);
        }

        if (actionObj is not ActionItem2 action)
        {
            return Fail($"Action {id} is not ActionItem2.", id);
        }

        if (!_actions.IsXAction(action))
        {
            return Fail($"Action {id} is not an XAction program. Trace run requires XAction.", id);
        }

        var payloadJson = _actions.GetPayloadJson(action, out var hydrateError);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return Fail(hydrateError ?? "Action has no XAction payload.", id);
        }

        XActionDto? payload;
        try
        {
            payload = JsonConvert.DeserializeObject<XActionDto>(payloadJson);
        }
        catch (Exception ex)
        {
            return Fail("XActionDto deserialize failed: " + ex.Message, id);
        }

        if (payload is null)
        {
            return Fail("XActionDto deserialize returned null.", id);
        }

        var title = ReadActionTitle(action);
        return ExecuteTrace(action, payload, id, title, inputParam, progress, streamCallbacks);
    }

    public QuickerRpcActionTraceRunResult RunXAction(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        IQuickerRpcClientCallbacks? streamCallbacks = null)
    {
        if (string.IsNullOrWhiteSpace(xActionJson))
        {
            return Fail("xActionJson is required.");
        }

        if (!IsInQuicker())
        {
            return Fail("Not running inside Quicker.");
        }

        XActionDto? payload;
        try
        {
            payload = JsonConvert.DeserializeObject<XActionDto>(xActionJson);
        }
        catch (Exception ex)
        {
            return Fail("XActionDto deserialize failed: " + ex.Message);
        }

        if (payload is null)
        {
            return Fail("XActionDto deserialize returned null.");
        }

        var action = new ActionItem2
        {
            Id = Guid.NewGuid(),
            Presentation = new OperationPresentation
            {
                Title = "ephemeral-trace",
            },
            OperationType = OperationTypes.XACTION,
            OperationPayload = payload,
        };

        return ExecuteTrace(
            action,
            payload,
            actionId: action.Id.ToString("D"),
            actionTitle: action.Presentation?.Title,
            inputParam,
            progress,
            streamCallbacks);
    }

    private QuickerRpcActionTraceRunResult ExecuteTrace(
        ActionItem2 action,
        XActionDto payload,
        string? actionId,
        string? actionTitle,
        string? inputParam,
        IProgress<QuickerRpcActionTraceEvent>? progress,
        IQuickerRpcClientCallbacks? streamCallbacks)
    {
        var programSteps = TryReadProgramSteps(payload);
        var stepIdToPath = programSteps is null
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : ActionTraceLocationResolver.BuildStepIdToPathMap(programSteps);

        var logger = new TerminalActionLogger(
            CreateStreamHandler(progress, streamCallbacks),
            stepIdToPath);
        var sw = Stopwatch.StartNew();

        ActionExecuteContext? context = null;
        Exception? runException = null;

        try
        {
            context = new ActionExecuteContext(
                action,
                targetInfo: null,
                isDebugging: true,
                parentId: 0,
                actionExtraContextData: null,
                cancellationToken: null)
            {
                ActionLogger = logger,
                ActionTrigger = ActionTrigger.Extern,
                InputParam = inputParam ?? string.Empty,
            };

            logger.BeginFile();
            // V2 overload is internal: ExecuteAction(ActionItem2, XActionDto, ActionExecuteContext).
            InvokeV2ExecuteAction(action, payload, context);
        }
        catch (Exception ex)
        {
            runException = ex.InnerException ?? ex;
        }

        if (runException is not null)
        {
            return WithFailureLocation(
                Fail(
                    runException.Message,
                    actionId,
                    actionTitle,
                    logger.Events,
                    sw.ElapsedMilliseconds,
                    runException.StackTrace ?? runException.ToString()),
                logger.Events,
                programSteps);
        }

        if (context is null)
        {
            return WithFailureLocation(
                Fail(
                    "Action execution did not produce a context.",
                    actionId,
                    actionTitle,
                    logger.Events,
                    sw.ElapsedMilliseconds),
                logger.Events,
                programSteps);
        }

        logger.EndFile();

        var returnResult = string.IsNullOrWhiteSpace(context.ReturnResult) ? null : context.ReturnResult;
        if (TryReadExecutionFailure(context, out var runtimeError, out var stopFlag))
        {
            return WithFailureLocation(
                new QuickerRpcActionTraceRunResult
                {
                    Ok = false,
                    ActionId = actionId,
                    ActionTitle = actionTitle,
                    ReturnResult = returnResult,
                    ErrorMessage = runtimeError,
                    StopFlag = stopFlag,
                    Message = runtimeError ?? "动作执行失败。",
                    DurationMs = sw.ElapsedMilliseconds,
                    EventCount = logger.Events.Count,
                    Events = [.. logger.Events],
                },
                logger.Events,
                programSteps);
        }

        return WithFailureLocation(
            new QuickerRpcActionTraceRunResult
            {
                Ok = true,
                ActionId = actionId,
                ActionTitle = actionTitle,
                ReturnResult = returnResult,
                Message = string.IsNullOrWhiteSpace(returnResult) ? "动作已运行。" : returnResult,
                DurationMs = sw.ElapsedMilliseconds,
                EventCount = logger.Events.Count,
                Events = [.. logger.Events],
            },
            logger.Events,
            programSteps);
    }

    private static QuickerRpcActionTraceRunResult WithFailureLocation(
        QuickerRpcActionTraceRunResult result,
        IReadOnlyList<QuickerRpcActionTraceEvent> events,
        JArray? programSteps)
    {
        if (result.Events.Count == 0 && events.Count > 0)
        {
            result.Events = [.. events];
            result.EventCount = events.Count;
        }

        return ActionTraceLocationResolver.AttachFailureLocation(result, programSteps);
    }

    private static JArray? TryReadProgramSteps(XActionDto payload)
    {
        try
        {
            var json = JsonConvert.SerializeObject(payload);
            var body = JObject.Parse(json);
            return ActionProgramContent.ReadBodyArrays(body).Steps;
        }
        catch
        {
            return null;
        }
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

    private static string? ReadActionTitle(ActionItem2 action)
    {
        var title = action.Presentation?.Title;
        return string.IsNullOrWhiteSpace(title) ? null : title;
    }

    private static QuickerRpcActionTraceRunResult Fail(
        string message,
        string? actionId = null,
        string? actionTitle = null,
        IReadOnlyList<QuickerRpcActionTraceEvent>? events = null,
        long durationMs = 0,
        string? stackTrace = null) =>
        new()
        {
            Ok = false,
            ActionId = actionId,
            ActionTitle = actionTitle,
            Message = message,
            ErrorMessage = message,
            StackTrace = stackTrace,
            DurationMs = durationMs,
            EventCount = events?.Count ?? 0,
            Events = events is null ? [] : [.. events],
        };

    private static Action<QuickerRpcActionTraceEvent>? CreateStreamHandler(
        IProgress<QuickerRpcActionTraceEvent>? progress,
        IQuickerRpcClientCallbacks? streamCallbacks)
    {
        if (progress is null && streamCallbacks is null)
        {
            return null;
        }

        return evt =>
        {
            try
            {
                progress?.Report(evt);
            }
            catch
            {
                // Best-effort streaming; RPC result still carries full trace.
            }

            if (streamCallbacks is null)
            {
                return;
            }

            try
            {
                _ = streamCallbacks.ActionTraceEventAsync(evt);
            }
            catch
            {
                // Legacy callback path; progress is preferred for live streaming.
            }
        };
    }

    private static void InvokeV2ExecuteAction(
        ActionItem2 action,
        XActionDto payload,
        ActionExecuteContext context)
    {
        var method = typeof(XActionRunner).GetMethod(
            "ExecuteAction",
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(ActionItem2), typeof(XActionDto), typeof(ActionExecuteContext)],
            modifiers: null);

        if (method is null)
        {
            throw new MissingMethodException(
                typeof(XActionRunner).FullName,
                "ExecuteAction(ActionItem2, XActionDto, ActionExecuteContext)");
        }

        method.Invoke(new XActionRunner(), [action, payload, context]);
    }

    private static bool IsInQuicker() =>
        Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
}
