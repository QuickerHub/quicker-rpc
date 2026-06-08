using System.Collections.Generic;

namespace QuickerRpc.AgentModel.XAction.Lint;

public static class ProgramDiagnosticsSchema
{
    public const string Id = "qkrpc.program-diagnostics.v1";
}

public enum ProgramDiagnosticsStatus
{
    Running,
    Ready,
    Failed,
    Stale,
    None,
}

public enum ProgramSyntaxIssueSeverity
{
    Error,
    Warning,
}

public enum ProgramSyntaxCheckKind
{
    Expression,
    CSharp,
    Interpolation,
    Structural,
    InputScript,
}

public sealed class ProgramSyntaxCheckItem
{
    public ProgramSyntaxCheckKind Kind { get; set; }

    public string Code { get; set; } = string.Empty;

    public string? StepRef { get; set; }

    public string? StepPath { get; set; }

    public string? StepId { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? ParamName { get; set; }

    public string? VariableKey { get; set; }

    public string? File { get; set; }

    public IReadOnlyDictionary<string, string>? VariableTypes { get; set; }
}

public sealed class ProgramSyntaxReadHint
{
    public string Tool { get; set; } = string.Empty;

    /// <summary>workspace_program sub-action, e.g. file_read, read_data.</summary>
    public string? Action { get; set; }

    public string? Path { get; set; }

    public int? StartLine { get; set; }

    public int? EndLine { get; set; }

    public string? Mode { get; set; }
}

public sealed class ProgramSyntaxIssueLocation
{
    public string? StepRef { get; set; }

    public string? StepId { get; set; }

    /// <summary>Patch-style path in <c>steps[]</c> (e.g. <c>0</c>, <c>2/if/1</c>).</summary>
    public string? StepPath { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? ParamName { get; set; }

    public string? VariableKey { get; set; }

    public string? File { get; set; }

    public int? Line { get; set; }

    public int? Column { get; set; }

    /// <summary>Logical path inside <c>data.json</c> for search/read_data anchors.</summary>
    public string? DataJsonPath { get; set; }

    public ProgramSyntaxReadHint? Read { get; set; }
}

public sealed class ProgramSyntaxIssue
{
    public ProgramSyntaxIssueSeverity Severity { get; set; }

    public ProgramSyntaxCheckKind Kind { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public ProgramSyntaxIssueLocation Location { get; set; } = new();

    /// <summary>One-line location + suggested read tool for agents.</summary>
    public string? LocationSummary { get; set; }
}

public sealed class ProgramDiagnosticsSummary
{
    public int ErrorCount { get; set; }

    public int WarningCount { get; set; }

    public int Checked { get; set; }

    public int Skipped { get; set; }

    /// <summary>Expression/C# snippets discovered (before compile cap).</summary>
    public int TotalChecks { get; set; }

    /// <summary>Compile checks skipped because of MaxChecksPerRun cap.</summary>
    public int Truncated { get; set; }

    /// <summary>Fast offline checks (structure + interpolation) included in Issues.</summary>
    public int FastIssueCount { get; set; }
}

public sealed class ProgramDiagnosticsDocument
{
    public string Schema { get; set; } = ProgramDiagnosticsSchema.Id;

    public string? Target { get; set; }

    public string? Id { get; set; }

    public string? SubProgramId { get; set; }

    public long? EditVersion { get; set; }

    public string? DataFingerprint { get; set; }

    public string Status { get; set; } = "none";

    public string? StartedAt { get; set; }

    public string? CompletedAt { get; set; }

    public string? LintError { get; set; }

    public ProgramDiagnosticsSummary Summary { get; set; } = new();

    public IList<ProgramSyntaxIssue> Issues { get; set; } = new List<ProgramSyntaxIssue>();
}
