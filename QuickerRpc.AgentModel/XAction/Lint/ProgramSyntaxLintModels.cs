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
}

public sealed class ProgramSyntaxCheckItem
{
    public ProgramSyntaxCheckKind Kind { get; set; }

    public string Code { get; set; } = string.Empty;

    public string? StepRef { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? ParamName { get; set; }

    public string? VariableKey { get; set; }

    public string? File { get; set; }

    public IReadOnlyDictionary<string, string>? VariableTypes { get; set; }
}

public sealed class ProgramSyntaxIssueLocation
{
    public string? StepRef { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? ParamName { get; set; }

    public string? VariableKey { get; set; }

    public string? File { get; set; }
}

public sealed class ProgramSyntaxIssue
{
    public ProgramSyntaxIssueSeverity Severity { get; set; }

    public ProgramSyntaxCheckKind Kind { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public ProgramSyntaxIssueLocation Location { get; set; } = new();
}

public sealed class ProgramDiagnosticsSummary
{
    public int ErrorCount { get; set; }

    public int WarningCount { get; set; }

    public int Checked { get; set; }

    public int Skipped { get; set; }
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
