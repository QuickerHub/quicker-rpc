using System;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Maps step-runner input param keys to workspace <c>files/</c> extensions during auto-externalize
/// and agent step-runner get hints.
/// </summary>
public static class StepRunnerResourceFileExtensions
{
    private const string RunScriptTypeDependentHint =
        "type-dependent: BAT→.bat, CMD_F/CMD_*→.cmd, PS→.ps1, AHK→.ahk, CUSTOM→ext param";

    /// <summary>
    /// Compact hint for agent step-runner get (<c>inputs[].fileExt</c>).
    /// </summary>
    public static string? TryGetAgentFileExtensionHint(
        string stepRunnerKey,
        string paramKey,
        bool isMultiLine,
        bool isControlField,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        if (isControlField || !ShouldHintFileExternalization(paramKey, isMultiLine))
        {
            return null;
        }

        var inputParams = BuildHintInputParams(stepRunnerKey, controlFieldKey, controlFieldValue);
        var runnerLower = (stepRunnerKey ?? string.Empty).Trim().ToLowerInvariant();
        var paramLower = (paramKey ?? string.Empty).Trim().ToLowerInvariant();

        if (runnerLower.Contains("runscript", StringComparison.Ordinal)
            && string.Equals(paramLower, "script", StringComparison.Ordinal)
            && ReadParamLiteral(inputParams, "type") is null)
        {
            return RunScriptTypeDependentHint;
        }

        var ext = Guess(stepRunnerKey, paramKey, inputParams, content: null);
        return ext == ".txt" ? null : ext;
    }

    public static string Guess(
        string stepRunnerKey,
        string paramKey,
        JObject? inputParams = null,
        string? content = null)
    {
        var runner = (stepRunnerKey ?? string.Empty).Trim();
        var runnerLower = runner.ToLowerInvariant();
        var param = (paramKey ?? string.Empty).Trim();
        var paramLower = param.ToLowerInvariant();

        if (string.Equals(paramLower, "formdef", StringComparison.Ordinal)
            || string.Equals(paramLower, "dynamicformfordictdef", StringComparison.Ordinal)
            || (runnerLower.Contains("form", StringComparison.Ordinal)
                && paramLower.Contains("formdef", StringComparison.Ordinal)))
        {
            return ".form.json";
        }

        if (runnerLower.Contains("evalexpression", StringComparison.Ordinal)
            && (string.Equals(paramLower, "expression", StringComparison.Ordinal)
                || string.Equals(paramLower, "code", StringComparison.Ordinal)))
        {
            return ".eval.cs";
        }

        if (runnerLower.Contains("pythonscript", StringComparison.Ordinal)
            && string.Equals(paramLower, "script", StringComparison.Ordinal))
        {
            return ".py";
        }

        if (runnerLower.Contains("jsscript", StringComparison.Ordinal)
            && string.Equals(paramLower, "script", StringComparison.Ordinal))
        {
            return ".js";
        }

        if (runnerLower.Contains("runscript", StringComparison.Ordinal)
            && string.Equals(paramLower, "script", StringComparison.Ordinal))
        {
            return GuessRunScriptExtension(inputParams);
        }

        if (runnerLower.Contains("csscript", StringComparison.Ordinal)
            && string.Equals(paramLower, "code", StringComparison.Ordinal))
        {
            return ".cs";
        }

        if (runnerLower.Contains("webview2", StringComparison.Ordinal))
        {
            if (string.Equals(paramLower, "script", StringComparison.Ordinal))
            {
                return ".js";
            }

            if (string.Equals(paramLower, "url", StringComparison.Ordinal))
            {
                return GuessWebViewUrlExtension(content);
            }
        }

        if (runnerLower.Contains("customwindow", StringComparison.Ordinal))
        {
            if (string.Equals(paramLower, "windowmarkup", StringComparison.Ordinal))
            {
                return ".xaml";
            }

            if (string.Equals(paramLower, "cscode", StringComparison.Ordinal))
            {
                return ".cs";
            }
        }

        if (runnerLower.Contains("dboperation", StringComparison.Ordinal)
            && string.Equals(paramLower, "sql", StringComparison.Ordinal))
        {
            return ".sql";
        }

        if (paramLower.Contains("html", StringComparison.Ordinal))
        {
            return ".html";
        }

        if (paramLower.Contains("json", StringComparison.Ordinal))
        {
            return ".json";
        }

        if (string.Equals(paramLower, "sql", StringComparison.Ordinal))
        {
            return ".sql";
        }

        if (string.Equals(paramLower, "xml", StringComparison.Ordinal)
            || paramLower.Contains("xaml", StringComparison.Ordinal))
        {
            return paramLower.Contains("xaml", StringComparison.Ordinal) ? ".xaml" : ".xml";
        }

        if (string.Equals(paramLower, "code", StringComparison.Ordinal))
        {
            return ".cs";
        }

        if (string.Equals(paramLower, "expression", StringComparison.Ordinal))
        {
            return ".eval.cs";
        }

        if (string.Equals(paramLower, "script", StringComparison.Ordinal))
        {
            return ".js";
        }

        return ".txt";
    }

    private static bool ShouldHintFileExternalization(string paramKey, bool isMultiLine)
    {
        if (isMultiLine)
        {
            return true;
        }

        var paramLower = (paramKey ?? string.Empty).Trim().ToLowerInvariant();
        return paramLower is "code"
            or "script"
            or "expression"
            or "url"
            or "formdef"
            or "dynamicformfordictdef"
            or "sql"
            or "html"
            or "htmldoc"
            or "windowmarkup"
            or "cscode";
    }

    private static JObject? BuildHintInputParams(
        string stepRunnerKey,
        string? controlFieldKey,
        string? controlFieldValue)
    {
        var applied = (controlFieldValue ?? string.Empty).Trim();
        if (applied.Length == 0)
        {
            return null;
        }

        var runnerLower = (stepRunnerKey ?? string.Empty).Trim().ToLowerInvariant();
        var controlKey = (controlFieldKey ?? string.Empty).Trim();
        if (runnerLower.Contains("runscript", StringComparison.Ordinal)
            && string.Equals(controlKey, "type", StringComparison.OrdinalIgnoreCase))
        {
            return new JObject
            {
                ["type"] = new JObject { ["value"] = applied },
            };
        }

        return null;
    }

    private static string GuessWebViewUrlExtension(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return ".html";
        }

        var trimmed = content.TrimStart();
        if (trimmed.StartsWith("<", StringComparison.Ordinal))
        {
            return ".html";
        }

        if (LooksLikeHttpUrl(trimmed))
        {
            return ".url.txt";
        }

        return ".html";
    }

    private static string GuessRunScriptExtension(JObject? inputParams)
    {
        var type = ReadParamLiteral(inputParams, "type");
        if (string.IsNullOrWhiteSpace(type))
        {
            return ".ps1";
        }

        return type.Trim().ToUpperInvariant() switch
        {
            "BAT" => ".bat",
            "CMD_F" => ".cmd",
            "CMD_K" or "CMD_C" or "CMD_H" => ".cmd",
            "PS" => ".ps1",
            "AHK" => ".ahk",
            "CUSTOM" => GuessCustomRunScriptExtension(inputParams),
            _ => ".ps1",
        };
    }

    private static string GuessCustomRunScriptExtension(JObject? inputParams)
    {
        var ext = ReadParamLiteral(inputParams, "ext");
        if (string.IsNullOrWhiteSpace(ext))
        {
            return ".txt";
        }

        ext = ext.Trim();
        return ext.StartsWith(".", StringComparison.Ordinal) ? ext : "." + ext;
    }

    private static string? ReadParamLiteral(JObject? inputParams, string paramKey)
    {
        if (inputParams is null)
        {
            return null;
        }

        if (inputParams[paramKey] is not JObject paramObj)
        {
            return null;
        }

        var value = paramObj.Value<string>("value");
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool LooksLikeHttpUrl(string trimmed)
    {
        return trimmed.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("file://", StringComparison.OrdinalIgnoreCase);
    }
}
