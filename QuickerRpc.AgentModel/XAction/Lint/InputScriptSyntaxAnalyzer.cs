using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Parses and validates <c>sys:inputScript</c> command lines (offline).</summary>
internal static class InputScriptSyntaxAnalyzer
{
    private static readonly HashSet<string> KnownCommands = new(StringComparer.OrdinalIgnoreCase)
    {
        "input",
        "input2",
        "sendkeys",
        "delay",
        "paste",
        "keydown",
        "keyup",
        "keypress",
        "hotkey",
        "moveto",
        "move",
        "click",
        "dbclick",
        "down",
        "up",
        "wheel",
        "wheeldelta",
        "hwheel",
        "hwheeldelta",
        "pastefile",
        "pasteimage",
    };

    private static readonly HashSet<string> MouseButtons = new(StringComparer.OrdinalIgnoreCase)
    {
        "left",
        "right",
        "middle",
        "x1",
        "x2",
    };

    private static readonly HashSet<string> CommandsRequiringParam = new(StringComparer.OrdinalIgnoreCase)
    {
        "delay",
        "sendkeys",
        "hotkey",
        "keydown",
        "keyup",
        "keypress",
        "moveto",
        "move",
        "click",
        "dbclick",
        "down",
        "up",
        "wheel",
        "wheeldelta",
        "hwheel",
        "hwheeldelta",
        "pastefile",
        "pasteimage",
        "paste",
    };

    private static readonly Regex CommandLinePattern = new(
        @"^([a-zA-Z][a-zA-Z0-9]*):(.*)$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex DelayParamPattern = new(
        @"^\d+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex IntegerParamPattern = new(
        @"^-?\d+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex MoveParamPattern = new(
        @"^-?\d+\s*,\s*-?\d+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex MoveToParamPattern = new(
        @"^\s*(\d+(\.\d+)?%?)\s*,\s*(\d+(\.\d+)?%?)\s*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex KeyTokenPattern = new(
        @"^#\d+$|^[A-Za-z][A-Za-z0-9]*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static void AnalyzeScriptBody(
        string text,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var keyboardDown = new Stack<string>();
        var mouseDown = new Stack<string>();
        var lineNumber = 0;

        foreach (var rawLine in text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            lineNumber++;
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith("//", StringComparison.Ordinal))
            {
                continue;
            }

            foreach (var segment in SplitInlineSegments(line))
            {
                var trimmed = segment.Trim();
                if (trimmed.Length == 0)
                {
                    continue;
                }

                ValidateCommandSegment(
                    trimmed,
                    lineNumber,
                    keyboardDown,
                    mouseDown,
                    issues,
                    stepPath,
                    stepId,
                    stepRunnerKey);
            }
        }

        ReportUnclosedStacks(keyboardDown, mouseDown, issues, stepPath, stepId, stepRunnerKey);
    }

    internal static IEnumerable<string> SplitInlineSegments(string line)
    {
        if (!line.Contains(";;", StringComparison.Ordinal))
        {
            yield return line;
            yield break;
        }

        foreach (var segment in line.Split(new[] { ";;" }, StringSplitOptions.None))
        {
            yield return segment;
        }
    }

    private static void ValidateCommandSegment(
        string segment,
        int lineNumber,
        Stack<string> keyboardDown,
        Stack<string> mouseDown,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        var match = CommandLinePattern.Match(segment);
        if (!match.Success)
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_LINE",
                $"inputScript line {lineNumber}: expected command:param (e.g. delay:1000).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        var command = match.Groups[1].Value;
        var param = match.Groups[2].Value;

        if (!KnownCommands.Contains(command))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Warning,
                "INPUT_SCRIPT_UNKNOWN_COMMAND",
                $"inputScript line {lineNumber}: unknown command \"{command}\".",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (CommandsRequiringParam.Contains(command) && string.IsNullOrWhiteSpace(param))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_EMPTY_PARAM",
                $"inputScript line {lineNumber}: command \"{command}\" requires a parameter.",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        ValidateCommandParam(command, param, lineNumber, issues, stepPath, stepId, stepRunnerKey);
        UpdatePairStacks(command, param, lineNumber, keyboardDown, mouseDown, issues, stepPath, stepId, stepRunnerKey);
    }

    private static void ValidateCommandParam(
        string command,
        string param,
        int lineNumber,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        var trimmed = param.Trim();
        if (string.Equals(command, "delay", StringComparison.OrdinalIgnoreCase)
            && !DelayParamPattern.IsMatch(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: delay parameter must be a non-negative integer (milliseconds).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (IsWheelCommand(command) && !IntegerParamPattern.IsMatch(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: {command} parameter must be an integer.",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (string.Equals(command, "move", StringComparison.OrdinalIgnoreCase)
            && !MoveParamPattern.IsMatch(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: move parameter must be dx,dy (e.g. move:10,-10).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (string.Equals(command, "moveto", StringComparison.OrdinalIgnoreCase)
            && !MoveToParamPattern.IsMatch(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: moveto parameter must be x,y or x%,y% (e.g. moveto:100,200).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (IsMouseButtonCommand(command) && !MouseButtons.Contains(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: {command} parameter must be left, right, middle, x1, or x2.",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (IsKeyboardKeyCommand(command) && !KeyTokenPattern.IsMatch(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: {command} parameter must be a key name (e.g. F1) or virtual-key code (e.g. #175).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
            return;
        }

        if (string.Equals(command, "hotkey", StringComparison.OrdinalIgnoreCase)
            && !IsValidHotkey(trimmed))
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Error,
                "INPUT_SCRIPT_INVALID_PARAM",
                $"inputScript line {lineNumber}: hotkey parameter must list keys joined by + (e.g. hotkey:Ctrl+S).",
                stepPath,
                stepId,
                stepRunnerKey,
                lineNumber);
        }
    }

    private static void UpdatePairStacks(
        string command,
        string param,
        int lineNumber,
        Stack<string> keyboardDown,
        Stack<string> mouseDown,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        var key = param.Trim();
        if (string.Equals(command, "keydown", StringComparison.OrdinalIgnoreCase))
        {
            keyboardDown.Push(NormalizeKeyToken(key));
            return;
        }

        if (string.Equals(command, "keyup", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = NormalizeKeyToken(key);
            if (keyboardDown.Count == 0 || !TryPopMatching(keyboardDown, normalized))
            {
                AddIssue(
                    issues,
                    ProgramSyntaxIssueSeverity.Error,
                    "INPUT_SCRIPT_UNMATCHED_KEYUP",
                    $"inputScript line {lineNumber}: keyup:{key} has no matching keydown.",
                    stepPath,
                    stepId,
                    stepRunnerKey,
                    lineNumber);
            }

            return;
        }

        if (string.Equals(command, "down", StringComparison.OrdinalIgnoreCase))
        {
            mouseDown.Push(key.ToLowerInvariant());
            return;
        }

        if (string.Equals(command, "up", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = key.ToLowerInvariant();
            if (mouseDown.Count == 0 || !TryPopMatching(mouseDown, normalized))
            {
                AddIssue(
                    issues,
                    ProgramSyntaxIssueSeverity.Error,
                    "INPUT_SCRIPT_UNMATCHED_MOUSE_UP",
                    $"inputScript line {lineNumber}: up:{key} has no matching down.",
                    stepPath,
                    stepId,
                    stepRunnerKey,
                    lineNumber);
            }
        }
    }

    private static void ReportUnclosedStacks(
        Stack<string> keyboardDown,
        Stack<string> mouseDown,
        IList<ProgramSyntaxIssue> issues,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        if (keyboardDown.Count > 0)
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Warning,
                "INPUT_SCRIPT_UNMATCHED_KEYDOWN",
                $"inputScript ends with {keyboardDown.Count} key(s) still held down (missing keyup).",
                stepPath,
                stepId,
                stepRunnerKey,
                line: null);
        }

        if (mouseDown.Count > 0)
        {
            AddIssue(
                issues,
                ProgramSyntaxIssueSeverity.Warning,
                "INPUT_SCRIPT_UNMATCHED_MOUSE_DOWN",
                $"inputScript ends with {mouseDown.Count} mouse button(s) still held down (missing up).",
                stepPath,
                stepId,
                stepRunnerKey,
                line: null);
        }
    }

    private static bool IsWheelCommand(string command) =>
        command.Equals("wheel", StringComparison.OrdinalIgnoreCase)
        || command.Equals("wheeldelta", StringComparison.OrdinalIgnoreCase)
        || command.Equals("hwheel", StringComparison.OrdinalIgnoreCase)
        || command.Equals("hwheeldelta", StringComparison.OrdinalIgnoreCase);

    private static bool IsMouseButtonCommand(string command) =>
        command.Equals("click", StringComparison.OrdinalIgnoreCase)
        || command.Equals("dbclick", StringComparison.OrdinalIgnoreCase)
        || command.Equals("down", StringComparison.OrdinalIgnoreCase)
        || command.Equals("up", StringComparison.OrdinalIgnoreCase);

    private static bool IsKeyboardKeyCommand(string command) =>
        command.Equals("keydown", StringComparison.OrdinalIgnoreCase)
        || command.Equals("keyup", StringComparison.OrdinalIgnoreCase)
        || command.Equals("keypress", StringComparison.OrdinalIgnoreCase);

    private static bool IsValidHotkey(string param)
    {
        var parts = param.Split('+');
        if (parts.Length == 0)
        {
            return false;
        }

        foreach (var part in parts)
        {
            if (string.IsNullOrWhiteSpace(part))
            {
                return false;
            }
        }

        return true;
    }

    private static string NormalizeKeyToken(string key) =>
        key.StartsWith("#", StringComparison.Ordinal)
            ? key
            : key.ToUpperInvariant();

    private static bool TryPopMatching(Stack<string> stack, string token)
    {
        if (stack.Count == 0)
        {
            return false;
        }

        if (string.Equals(stack.Peek(), token, StringComparison.OrdinalIgnoreCase))
        {
            stack.Pop();
            return true;
        }

        var snapshot = stack.ToArray();
        for (var i = 0; i < snapshot.Length; i++)
        {
            if (!string.Equals(snapshot[i], token, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            for (var j = 0; j <= i; j++)
            {
                stack.Pop();
            }

            return true;
        }

        return false;
    }

    private static void AddIssue(
        IList<ProgramSyntaxIssue> issues,
        ProgramSyntaxIssueSeverity severity,
        string code,
        string message,
        string? stepPath,
        string? stepId,
        string? stepRunnerKey,
        int? line)
    {
        var item = new ProgramSyntaxCheckItem
        {
            Kind = ProgramSyntaxCheckKind.InputScript,
            StepPath = stepPath,
            StepRef = stepId,
            StepId = stepId,
            StepRunnerKey = stepRunnerKey,
            ParamName = "data",
        };

        var issue = ProgramSyntaxIssueFactory.Create(
            item,
            severity,
            ProgramSyntaxCheckKind.InputScript,
            code,
            message);
        if (line is > 0)
        {
            issue.Location.Line = line;
        }

        issues.Add(issue);
    }
}
