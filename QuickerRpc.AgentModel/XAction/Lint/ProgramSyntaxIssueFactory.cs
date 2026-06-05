using System;

namespace QuickerRpc.AgentModel.XAction.Lint;

public static class ProgramSyntaxIssueFactory
{
    private const string WorkspaceProgramTool = "workspace_program";

    public static ProgramSyntaxIssue Create(
        ProgramSyntaxCheckItem item,
        ProgramSyntaxIssueSeverity severity,
        ProgramSyntaxCheckKind kind,
        string code,
        string message)
    {
        ProgramSyntaxCompileMessageParser.TryParseLineColumn(message, out var line, out var column);
        var location = BuildLocation(item, line > 0 ? line : null, column > 0 ? column : null);
        return new ProgramSyntaxIssue
        {
            Severity = severity,
            Kind = kind,
            Code = code,
            Message = message,
            Location = location,
            LocationSummary = FormatLocationSummary(location),
        };
    }

    public static ProgramSyntaxIssue CreateInterpolationWarning(
        string? stepPath,
        string? stepId,
        string? stepRunnerKey,
        string? paramName,
        string? variableKey,
        string code,
        string message)
    {
        var item = new ProgramSyntaxCheckItem
        {
            Kind = ProgramSyntaxCheckKind.Interpolation,
            StepPath = stepPath,
            StepRef = stepId,
            StepId = stepId,
            StepRunnerKey = stepRunnerKey,
            ParamName = paramName,
            VariableKey = variableKey,
        };
        return Create(item, ProgramSyntaxIssueSeverity.Warning, ProgramSyntaxCheckKind.Interpolation, code, message);
    }

    private static ProgramSyntaxIssueLocation BuildLocation(
        ProgramSyntaxCheckItem item,
        int? line,
        int? column)
    {
        var dataJsonPath = BuildDataJsonPath(item);
        var read = BuildReadHint(item, line);
        return new ProgramSyntaxIssueLocation
        {
            StepRef = item.StepRef,
            StepId = item.StepId,
            StepPath = item.StepPath,
            StepRunnerKey = item.StepRunnerKey,
            ParamName = item.ParamName,
            VariableKey = item.VariableKey,
            File = item.File,
            Line = line,
            Column = column,
            DataJsonPath = dataJsonPath,
            Read = read,
        };
    }

    private static string? BuildDataJsonPath(ProgramSyntaxCheckItem item)
    {
        if (!string.IsNullOrWhiteSpace(item.VariableKey))
        {
            return !string.IsNullOrWhiteSpace(item.File)
                ? $"variables[key={item.VariableKey}].defaultValue.file"
                : $"variables[key={item.VariableKey}].defaultValue";
        }

        if (string.IsNullOrWhiteSpace(item.StepPath))
        {
            return null;
        }

        var param = string.IsNullOrWhiteSpace(item.ParamName) ? "?" : item.ParamName;
        if (!string.IsNullOrWhiteSpace(item.File))
        {
            return $"steps[{item.StepPath}].inputParams.{param}.file";
        }

        return $"steps[{item.StepPath}].inputParams.{param}";
    }

    private static ProgramSyntaxReadHint? BuildReadHint(ProgramSyntaxCheckItem item, int? line)
    {
        if (!string.IsNullOrWhiteSpace(item.File))
        {
            var start = line.HasValue ? Math.Max(1, line.Value - 4) : 1;
            var end = line.HasValue ? line.Value + 4 : (int?)null;
            return new ProgramSyntaxReadHint
            {
                Tool = WorkspaceProgramTool,
                Action = "file_read",
                Path = item.File,
                StartLine = start,
                EndLine = end,
            };
        }

        if (!string.IsNullOrWhiteSpace(item.StepPath) || !string.IsNullOrWhiteSpace(item.VariableKey))
        {
            return new ProgramSyntaxReadHint
            {
                Tool = WorkspaceProgramTool,
                Action = "read_data",
                Mode = "content",
            };
        }

        return null;
    }

    public static string FormatLocationSummary(ProgramSyntaxIssueLocation location)
    {
        var parts = new System.Collections.Generic.List<string>();

        if (!string.IsNullOrWhiteSpace(location.StepId))
        {
            var pathPart = string.IsNullOrWhiteSpace(location.StepPath)
                ? string.Empty
                : $" path {location.StepPath}";
            parts.Add($"step {location.StepId}{pathPart}");
        }
        else if (!string.IsNullOrWhiteSpace(location.VariableKey))
        {
            parts.Add($"variable {location.VariableKey}");
        }

        if (!string.IsNullOrWhiteSpace(location.StepRunnerKey))
        {
            parts.Add(location.StepRunnerKey);
        }

        if (!string.IsNullOrWhiteSpace(location.ParamName))
        {
            parts.Add($"param {location.ParamName}");
        }

        if (!string.IsNullOrWhiteSpace(location.File))
        {
            var at = location.Line is > 0
                ? $":{location.Line}{(location.Column is > 0 ? $":{location.Column}" : string.Empty)}"
                : string.Empty;
            parts.Add($"file {location.File}{at}");
        }
        else if (!string.IsNullOrWhiteSpace(location.DataJsonPath))
        {
            parts.Add($"data.json {location.DataJsonPath}");
        }

        if (location.Read is not null)
        {
            parts.Add(FormatReadHint(location.Read));
        }

        return parts.Count == 0 ? "unknown" : string.Join(" · ", parts);
    }

    private static string FormatReadHint(ProgramSyntaxReadHint read)
    {
        var action = ResolveReadAction(read);
        if (action == "file_read" && !string.IsNullOrWhiteSpace(read.Path))
        {
            var args = new System.Collections.Generic.List<string>
            {
                "action: \"file_read\"",
                $"path: \"{EscapeJsonString(read.Path)}\"",
            };
            if (read.StartLine is > 0)
            {
                args.Add($"startLine: {read.StartLine.Value}");
            }

            if (read.EndLine is > 0)
            {
                args.Add($"endLine: {read.EndLine.Value}");
            }

            return $"read workspace_program({{ {string.Join(", ", args)} }})";
        }

        if (action == "read_data")
        {
            var mode = string.IsNullOrWhiteSpace(read.Mode) ? "content" : read.Mode;
            return $"read workspace_program({{ action: \"read_data\", mode: \"{EscapeJsonString(mode)}\" }}) then locate dataJsonPath";
        }

        return string.IsNullOrWhiteSpace(read.Tool) ? "read (see location)" : $"read {read.Tool}";
    }

    private static string? ResolveReadAction(ProgramSyntaxReadHint read)
    {
        if (!string.IsNullOrWhiteSpace(read.Action))
        {
            return read.Action;
        }

        return read.Tool switch
        {
            "workspace_action_file_read" => "file_read",
            "workspace_action_read_data" => "read_data",
            _ => null,
        };
    }

    private static string EscapeJsonString(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");
}
