using System;

namespace QuickerRpc.AgentModel.XAction.Lint;

public static class ProgramSyntaxIssueFactory
{
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
                Tool = "workspace_action_file_read",
                Path = item.File,
                StartLine = start,
                EndLine = end,
            };
        }

        if (!string.IsNullOrWhiteSpace(item.StepPath) || !string.IsNullOrWhiteSpace(item.VariableKey))
        {
            return new ProgramSyntaxReadHint
            {
                Tool = "workspace_action_read_data",
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
        if (read.Tool == "workspace_action_file_read" && !string.IsNullOrWhiteSpace(read.Path))
        {
            if (read.StartLine is > 0 && read.EndLine is > 0)
            {
                return
                    $"read workspace_action_file_read(path={read.Path}, startLine={read.StartLine}, endLine={read.EndLine})";
            }

            if (read.StartLine is > 0)
            {
                return $"read workspace_action_file_read(path={read.Path}, startLine={read.StartLine})";
            }

            return $"read workspace_action_file_read(path={read.Path})";
        }

        if (read.Tool == "workspace_action_read_data")
        {
            return "read workspace_action_read_data(mode=content) then locate dataJsonPath";
        }

        return string.IsNullOrWhiteSpace(read.Tool) ? "read (see location)" : $"read {read.Tool}";
    }
}
