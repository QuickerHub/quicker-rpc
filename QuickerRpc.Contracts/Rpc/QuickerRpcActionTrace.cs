using System.Collections.Generic;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>One structured trace line from plugin XActionRunner debug execution.</summary>
public sealed class QuickerRpcActionTraceEvent
{
    public int Sequence { get; set; }

    /// <summary>step_begin | step_end | group_begin | group_end | input | output | info | warning | error | repeat_begin | repeat_end | var_state</summary>
    public string Kind { get; set; } = string.Empty;

    public int Depth { get; set; }

    public string? StepId { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? StepRunnerName { get; set; }

    public string? Note { get; set; }

    public string? Message { get; set; }

    public string? ParamKey { get; set; }

    public string? ParamExpression { get; set; }

    public string? ParamValue { get; set; }

    public string? VarName { get; set; }

    public string? VarKey { get; set; }

    public long ElapsedMs { get; set; }

    /// <summary>Step index path in data.json (e.g. <c>1</c>, <c>0/if/0</c>) — aligned with patch/diagnostics stepPath.</summary>
    public string? StepPath { get; set; }
}

/// <summary>Resolved failure location for agent patch workflow (data.json step + param).</summary>
public sealed class QuickerRpcActionTraceFailureLocation
{
    public string? StepId { get; set; }

    public string? StepPath { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? ParamKey { get; set; }

    public string? DataJsonPointer { get; set; }

    public string? Message { get; set; }

    public string? MatchMethod { get; set; }
}

public sealed class QuickerRpcActionTraceRunResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ActionTitle { get; set; }

    public string? ReturnResult { get; set; }

    public string? ErrorMessage { get; set; }

    public string? StopFlag { get; set; }

    public long DurationMs { get; set; }

    public int EventCount { get; set; }

    public List<QuickerRpcActionTraceEvent> Events { get; set; } = [];

    public QuickerRpcActionTraceFailureLocation? FailureLocation { get; set; }
}
