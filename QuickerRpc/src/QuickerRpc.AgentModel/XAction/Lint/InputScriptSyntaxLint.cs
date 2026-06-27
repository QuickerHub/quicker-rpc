using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Lint;

/// <summary>Offline validation for <c>sys:inputScript</c> step script (<c>data</c> param).</summary>
public static class InputScriptSyntaxLint
{
    private const string InputScriptRunnerKey = "sys:inputScript";
    private const string DataParamName = "data";

    public static IList<ProgramSyntaxIssue> Analyze(string projectDirectory, JObject data)
    {
        var issues = new List<ProgramSyntaxIssue>();
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);

        if (data["steps"] is not JArray steps)
        {
            return issues;
        }

        ProgramSyntaxStepPaths.Walk(
            steps,
            (step, stepPath, stepId, runnerKey) =>
            {
                if (!string.Equals(runnerKey, InputScriptRunnerKey, StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                if (UsesVariableBinding(step))
                {
                    return;
                }

                if (!TryReadScriptBody(projectDir, step, out var text))
                {
                    issues.Add(CreateMissingDataIssue(stepPath, stepId, runnerKey));
                    return;
                }

                InputScriptSyntaxAnalyzer.AnalyzeScriptBody(text, issues, stepPath, stepId, runnerKey);
            });

        return issues;
    }

    private static bool UsesVariableBinding(JObject step)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return false;
        }

        return inputParams.Property($"{DataParamName}.var") is not null
               || inputParams.Property("Data.var") is not null;
    }

    private static ProgramSyntaxIssue CreateMissingDataIssue(
        string? stepPath,
        string? stepId,
        string? stepRunnerKey)
    {
        var item = new ProgramSyntaxCheckItem
        {
            Kind = ProgramSyntaxCheckKind.InputScript,
            StepPath = stepPath,
            StepRef = stepId,
            StepId = stepId,
            StepRunnerKey = stepRunnerKey,
            ParamName = DataParamName,
        };

        return ProgramSyntaxIssueFactory.Create(
            item,
            ProgramSyntaxIssueSeverity.Warning,
            ProgramSyntaxCheckKind.InputScript,
            "INPUT_SCRIPT_MISSING_DATA",
            "inputScript step has no data script (set inputParams.data or data.file).");
    }

    private static bool TryReadScriptBody(string projectDir, JObject step, out string text) =>
        InputScriptParamReader.TryRead(projectDir, step, out text);
}

/// <summary>Reads inline or file-backed <c>inputParams.data</c> for lint.</summary>
internal static class InputScriptParamReader
{
    private const string DataParamName = "data";

    public static bool TryRead(string projectDir, JObject step, out string text)
    {
        text = string.Empty;
        if (step["inputParams"] is not JObject inputParams)
        {
            return false;
        }

        if (!inputParams.TryGetValue(DataParamName, out var token) && !inputParams.TryGetValue("Data", out token))
        {
            return false;
        }

        return TryReadParamText(projectDir, token, out text) && text.Length > 0;
    }

    private static bool TryReadParamText(string projectDir, JToken? paramToken, out string text)
    {
        text = string.Empty;
        if (paramToken is null || paramToken.Type == JTokenType.Null)
        {
            return false;
        }

        if (paramToken.Type == JTokenType.String)
        {
            text = paramToken.Value<string>() ?? string.Empty;
            return true;
        }

        if (paramToken is not JObject paramObj)
        {
            return false;
        }

        if (TryReadNonEmptyString(paramObj["file"], out var filePath))
        {
            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, filePath!);
            if (!System.IO.File.Exists(fullPath))
            {
                return false;
            }

            text = System.IO.File.ReadAllText(fullPath);
            return true;
        }

        if (paramObj["value"] is JToken valueToken && valueToken.Type != JTokenType.Null)
        {
            text = valueToken.Type == JTokenType.String
                ? valueToken.Value<string>() ?? string.Empty
                : valueToken.ToString();
            return true;
        }

        return false;
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }
}
