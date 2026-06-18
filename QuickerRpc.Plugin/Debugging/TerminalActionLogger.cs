using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using Quicker.Domain.Actions.Debugging;
using Quicker.Domain.Actions.X.StepRunners;
using Quicker.Domain.Actions.X.Storage;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Debugging;

/// <summary>
/// Captures XActionRunner debug output for terminal/agent consumption (implements Quicker IActionLogger).
/// </summary>
internal sealed class TerminalActionLogger : IActionLogger
{
    private const int MaxValueLength = 800;

    private readonly Action<QuickerRpcActionTraceEvent>? _onEvent;
    private readonly IReadOnlyDictionary<string, string> _stepIdToPath;
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    private readonly List<QuickerRpcActionTraceEvent> _events = [];
    private readonly Stack<int> _depthStack = new();
    private int _sequence;

    private string? _currentStepId;
    private string? _currentStepPath;
    private string? _currentStepRunnerKey;
    private string? _currentStepRunnerName;
    private string? _currentNote;

    public TerminalActionLogger(
        Action<QuickerRpcActionTraceEvent>? onEvent = null,
        IReadOnlyDictionary<string, string>? stepIdToPath = null)
    {
        _onEvent = onEvent;
        _stepIdToPath = stepIdToPath ?? new Dictionary<string, string>(StringComparer.Ordinal);
    }

    public IReadOnlyList<QuickerRpcActionTraceEvent> Events => _events;

    public void BeginFile() => Emit("file_begin", message: "trace begin");

    public void EndFile() => Emit("file_end", message: "trace end");

    public void BeginStepGroup(string note, int childCount) =>
        Emit("group_begin", note: note, message: childCount > 0 ? $"children={childCount}" : null, pushDepth: true);

    public void EndStepGroup()
    {
        if (_depthStack.Count > 0)
        {
            _depthStack.Pop();
        }

        Emit("group_end");
    }

    public void BeginStep(ActionStep step, string stepId)
    {
        _currentStepId = NullIfEmpty(stepId);
        _currentStepRunnerKey = NullIfEmpty(step.StepRunnerKey);
        _currentStepRunnerName = NullIfEmpty(step.StepRunnerName);
        _currentNote = NullIfEmpty(step.Note);
        _currentStepPath = ResolveStepPath(stepId);

        Emit(
            "step_begin",
            stepId: stepId,
            stepRunnerKey: step.StepRunnerKey,
            stepRunnerName: step.StepRunnerName,
            note: step.Note,
            stepPath: _currentStepPath,
            pushDepth: true);
    }

    public void EndStep()
    {
        if (_depthStack.Count > 0)
        {
            _depthStack.Pop();
        }

        Emit("step_end", stepId: _currentStepId, stepPath: _currentStepPath);
        ClearCurrentStep();
    }

    public void LogInput(StepInParamDef inputParam, object? paramValue, string? paramExpression, ActionStep step) =>
        Emit(
            "input",
            stepId: _currentStepId,
            stepRunnerKey: step.StepRunnerKey,
            stepPath: _currentStepPath,
            paramKey: inputParam.Key,
            paramExpression: paramExpression,
            paramValue: FormatValue(paramValue),
            message: inputParam.Name);

    public void LogOutput(StepOutParamDef outputParam, string? varName, object? paramValue) =>
        Emit(
            "output",
            stepId: _currentStepId,
            stepPath: _currentStepPath,
            paramKey: outputParam.Key,
            varName: varName,
            paramValue: FormatValue(paramValue),
            message: outputParam.Name);

    public void LogInfo(string message) => Emit("info", message: message);

    public void LogFileName() { }

    public void LogWarning(string message) =>
        Emit(
            "warning",
            message: message,
            stepId: _currentStepId,
            stepPath: _currentStepPath,
            stepRunnerKey: _currentStepRunnerKey);

    public void LogError(string message) =>
        Emit(
            "error",
            message: message,
            stepId: _currentStepId,
            stepPath: _currentStepPath,
            stepRunnerKey: _currentStepRunnerKey,
            stepRunnerName: _currentStepRunnerName,
            note: _currentNote);

    public void LogError(string message, Exception exception) =>
        Emit(
            "error",
            message: string.IsNullOrWhiteSpace(message) ? exception.Message : $"{message}: {exception.Message}",
            stepId: _currentStepId,
            stepPath: _currentStepPath,
            stepRunnerKey: _currentStepRunnerKey,
            stepRunnerName: _currentStepRunnerName,
            note: _currentNote);

    public void Flush() { }

    public void OpenLogFile() { }

    public void BeginRepeat(string note) => Emit("repeat_begin", note: note, pushDepth: true);

    public void EndRepeat()
    {
        if (_depthStack.Count > 0)
        {
            _depthStack.Pop();
        }

        Emit("repeat_end");
    }

    public void AddRawContent(string contentHtml) =>
        Emit("info", message: StripHtml(contentHtml));

    public void LogLoadState(string varKey, string? value) =>
        Emit("var_state", varKey: varKey, paramValue: value);

    private void ClearCurrentStep()
    {
        _currentStepId = null;
        _currentStepPath = null;
        _currentStepRunnerKey = null;
        _currentStepRunnerName = null;
        _currentNote = null;
    }

    private string? ResolveStepPath(string stepId)
    {
        if (string.IsNullOrWhiteSpace(stepId))
        {
            return null;
        }

        if (_stepIdToPath.TryGetValue(stepId.Trim(), out var path))
        {
            return path;
        }

        var parts = stepId.Trim().Split('-');
        while (parts.Length > 1 && int.TryParse(parts[^1], out _))
        {
            Array.Resize(ref parts, parts.Length - 1);
            var candidate = string.Join("-", parts);
            if (_stepIdToPath.TryGetValue(candidate, out path))
            {
                return path;
            }
        }

        return null;
    }

    private void Emit(
        string kind,
        string? stepId = null,
        string? stepRunnerKey = null,
        string? stepRunnerName = null,
        string? note = null,
        string? message = null,
        string? paramKey = null,
        string? paramExpression = null,
        string? paramValue = null,
        string? varName = null,
        string? varKey = null,
        string? stepPath = null,
        bool pushDepth = false)
    {
        var depth = _depthStack.Count;
        if (pushDepth)
        {
            _depthStack.Push(depth + 1);
        }

        var evt = new QuickerRpcActionTraceEvent
        {
            Sequence = ++_sequence,
            Kind = kind,
            Depth = depth,
            StepId = NullIfEmpty(stepId),
            StepPath = NullIfEmpty(stepPath),
            StepRunnerKey = NullIfEmpty(stepRunnerKey),
            StepRunnerName = NullIfEmpty(stepRunnerName),
            Note = NullIfEmpty(note),
            Message = NullIfEmpty(message),
            ParamKey = NullIfEmpty(paramKey),
            ParamExpression = NullIfEmpty(paramExpression),
            ParamValue = NullIfEmpty(paramValue),
            VarName = NullIfEmpty(varName),
            VarKey = NullIfEmpty(varKey),
            ElapsedMs = _stopwatch.ElapsedMilliseconds,
        };

        _events.Add(evt);
        _onEvent?.Invoke(evt);
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    private static string FormatValue(object? value)
    {
        if (value is null)
        {
            return "(null)";
        }

        string text;
        try
        {
            text = value switch
            {
                string s => s,
                bool b => b ? "True" : "False",
                _ => value.ToString() ?? string.Empty,
            };
        }
        catch
        {
            text = value.GetType().Name;
        }

        if (text.Length <= MaxValueLength)
        {
            return text;
        }

        return text.Substring(0, MaxValueLength) + "…";
    }

    private static string StripHtml(string? html)
    {
        if (string.IsNullOrWhiteSpace(html))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(html.Length);
        var inTag = false;
        foreach (var ch in html)
        {
            if (ch == '<')
            {
                inTag = true;
                continue;
            }

            if (ch == '>')
            {
                inTag = false;
                continue;
            }

            if (!inTag)
            {
                sb.Append(ch);
            }
        }

        return sb.ToString().Trim();
    }
}
