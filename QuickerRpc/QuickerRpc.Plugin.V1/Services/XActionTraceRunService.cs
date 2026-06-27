using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Reflection;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.Runtime;
using Quicker.Domain.Actions.Runner;
using Quicker.Domain.Actions.X;
using Quicker.Public.Entities;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Debugging;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Headless XAction trace run: plugin-owned <see cref="XActionRunner"/> with <c>IsDebugging</c> and
/// <see cref="TerminalActionLogger"/> (no Quicker step debugger UI).
/// </summary>
public sealed class XActionTraceRunService
{
    private readonly LegacyActionProgramAccessor? _actions;

    public XActionTraceRunService()
    {
        _actions = LegacyActionProgramAccessor.TryCreate();
    }

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
            return Fail("DataService unavailable.", id);
        }

        if (!_actions.TryGetById(id, out var actionItem, out var loadError) || actionItem is null)
        {
            return Fail(loadError ?? $"Action not found: {id}", id);
        }

        if (!_actions.IsXAction(actionItem))
        {
            return Fail($"Action {id} is not an XAction program. Trace run requires XAction.", id);
        }

        return ExecuteTrace(
            actionItem,
            actionId: id,
            actionTitle: ReadActionTitle(actionItem),
            inputParam,
            progress,
            streamCallbacks);
    }

    public QuickerRpcActionTraceRunResult RunXAction(
        string xActionJson,
        string? inputParam = null,
        string? projectDirectory = null,
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

        if (!XActionEphemeralProgramBuilder.TryBuild(
                xActionJson,
                projectDirectory,
                out var actionItem,
                out var title,
                out var buildError)
            || actionItem is null)
        {
            return Fail(buildError ?? "Failed to build ephemeral XAction.");
        }

        return ExecuteTrace(
            actionItem,
            actionId: actionItem.Id,
            actionTitle: title,
            inputParam,
            progress,
            streamCallbacks);
    }

    private QuickerRpcActionTraceRunResult ExecuteTrace(
        ActionItem actionItem,
        string? actionId,
        string? actionTitle,
        string? inputParam,
        IProgress<QuickerRpcActionTraceEvent>? progress,
        IQuickerRpcClientCallbacks? streamCallbacks)
    {
        var programSteps = TryReadProgramSteps(actionItem);
        var stepIdToPath = programSteps is null
            ? new Dictionary<string, string>(StringComparer.Ordinal)
            : ActionTraceLocationResolver.BuildStepIdToPathMap(programSteps);

        var appServer = AppState.AppServer;
        if (appServer is null)
        {
            return Fail("AppServer unavailable.", actionId, actionTitle);
        }

        var logger = new TerminalActionLogger(
            CreateStreamHandler(progress, streamCallbacks),
            stepIdToPath);
        var sw = Stopwatch.StartNew();

        ActionExecuteContext? context = null;
        Exception? runException = null;

        try
        {
            context = CreateTraceContext(actionItem, appServer, inputParam, logger);
            var runner = new XActionRunner();
            runner.ExecuteAction(actionItem, 0, appServer, context);
        }
        catch (Exception ex)
        {
            runException = ex;
        }

        if (runException is not null)
        {
            return WithFailureLocation(
                Fail(runException.Message, actionId, actionTitle, logger.Events, sw.ElapsedMilliseconds),
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

    private JArray? TryReadProgramSteps(ActionItem actionItem)
    {
        if (_actions is null)
        {
            return TryReadProgramStepsFromData(actionItem.Data);
        }

        var payloadJson = _actions.GetPayloadJson(actionItem, out _);
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return TryReadProgramStepsFromData(actionItem.Data);
        }

        try
        {
            var body = JObject.Parse(payloadJson);
            return ActionProgramContent.ReadBodyArrays(body).Steps;
        }
        catch
        {
            return TryReadProgramStepsFromData(actionItem.Data);
        }
    }

    private static JArray? TryReadProgramStepsFromData(string? dataJson)
    {
        if (!ActionProgramContent.IsXActionBody(dataJson))
        {
            return null;
        }

        try
        {
            return ActionProgramContent.ReadBodyArrays(JObject.Parse(dataJson!)).Steps;
        }
        catch
        {
            return null;
        }
    }

    private static ActionExecuteContext CreateTraceContext(
        ActionItem actionItem,
        AppServer appServer,
        string? inputParam,
        TerminalActionLogger logger)
    {
        var context = new ActionExecuteContext(
            actionItem,
            targetInfo: null,
            appServer,
            isDebugging: true,
            parentId: 0,
            actionExtraContextData: new ActionExtraContextData(),
            cancellationToken: null)
        {
            ActionLogger = logger,
            ActionTrigger = ActionTrigger.Extern,
            InputParam = inputParam ?? string.Empty,
        };

        logger.BeginFile();
        return context;
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

    private static string? ReadActionTitle(ActionItem actionItem)
    {
        var presentation = actionItem.GetType().GetProperty("Presentation")?.GetValue(actionItem);
        var fromPresentation = presentation?.GetType().GetProperty("Title")?.GetValue(presentation) as string;
        if (!string.IsNullOrWhiteSpace(fromPresentation))
        {
            return fromPresentation;
        }

        return actionItem.Title;
    }

    private static QuickerRpcActionTraceRunResult Fail(
        string message,
        string? actionId = null,
        string? actionTitle = null,
        IReadOnlyList<QuickerRpcActionTraceEvent>? events = null,
        long durationMs = 0) =>
        new()
        {
            Ok = false,
            ActionId = actionId,
            ActionTitle = actionTitle,
            Message = message,
            ErrorMessage = message,
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

    private static bool IsInQuicker() =>
        Assembly.GetEntryAssembly()?.GetName().Name == "Quicker";
}
