using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Writes long inline <c>value</c> strings to project files and replaces them with <c>file</c> refs.
/// </summary>
public static class XActionFileRefAutoExternalizer
{
    public const string DefaultFilesSubdir = "files";

    /// <summary>Deprecated; use <see cref="VariableDefaultValueRef"/>.</summary>
    public const string VariableDefaultValueFileProperty =
        VariableDefaultValueRef.LegacyDefaultValueFileProperty;

    public sealed class ApplyResult
    {
        public IReadOnlyList<string> WrittenFiles { get; set; } = Array.Empty<string>();

        public IReadOnlyList<ActionProjectResourceFile> ResourceFiles { get; set; } =
            Array.Empty<ActionProjectResourceFile>();

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    public static ApplyResult Apply(
        JObject data,
        string projectDirectory,
        int minLines,
        int minChars = 0)
    {
        if (minLines <= 0 && minChars <= 0)
        {
            return new ApplyResult();
        }

        if (data["steps"] is not JArray steps)
        {
            return new ApplyResult
            {
                Warnings = new[] { "auto externalize skipped: steps must be an array." },
            };
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var slugCounters = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var resourceFiles = new List<ActionProjectResourceFile>();
        var warnings = new List<string>();
        var effectiveMinChars = minChars > 0
            ? minChars
            : XActionFileRefExportOptions.DefaultAutoExternalizeMinChars;

        if (minLines > 0)
        {
            ExternalizeSteps(steps, projectDir, minLines, slugCounters, resourceFiles, warnings);
        }

        if (data["variables"] is JArray variables && (minLines > 0 || effectiveMinChars > 0))
        {
            ExternalizeVariables(
                variables,
                minLines,
                effectiveMinChars,
                slugCounters,
                resourceFiles,
                warnings);
        }

        return new ApplyResult
        {
            ResourceFiles = resourceFiles,
            WrittenFiles = resourceFiles
                .Select(f => XActionFileRefPath.NormalizeRelativePath(f.RelativePath))
                .ToList(),
            Warnings = warnings,
        };
    }

    private static void ExternalizeSteps(
        JArray steps,
        string projectDir,
        int minLines,
        Dictionary<string, int> slugCounters,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepRunnerKey = step.Value<string>("stepRunnerKey") ?? "";
            if (step["inputParams"] is JObject inputParams)
            {
                ExternalizeInputParams(
                    inputParams,
                    stepRunnerKey,
                    projectDir,
                    minLines,
                    slugCounters,
                    resourceFiles,
                    warnings);
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                ExternalizeSteps(ifSteps, projectDir, minLines, slugCounters, resourceFiles, warnings);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                ExternalizeSteps(elseSteps, projectDir, minLines, slugCounters, resourceFiles, warnings);
            }
        }
    }

    private static void ExternalizeInputParams(
        JObject inputParams,
        string stepRunnerKey,
        string projectDir,
        int minLines,
        Dictionary<string, int> slugCounters,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings)
    {
        foreach (var prop in inputParams.Properties().ToList())
        {
            if (prop.Value is not JObject paramObj)
            {
                continue;
            }

            if (paramObj["file"] is not null && paramObj["file"].Type != JTokenType.Null)
            {
                continue;
            }

            if (string.Equals(stepRunnerKey, "sys:form", StringComparison.OrdinalIgnoreCase)
                && (string.Equals(prop.Name, "formDef", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(prop.Name, "dynamicFormForDictDef", StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            if (paramObj["varKey"] is not null && paramObj["varKey"].Type != JTokenType.Null)
            {
                continue;
            }

            var value = paramObj.Value<string>("value");
            if (value is null || !ShouldExternalizeByLines(value, minLines))
            {
                continue;
            }

            var slug = ModuleSlug(stepRunnerKey, prop.Name);
            if (!slugCounters.TryGetValue(slug, out var n))
            {
                n = 0;
            }

            n++;
            slugCounters[slug] = n;

            var ext = GuessExtension(stepRunnerKey, prop.Name, inputParams, value);
            var relativePath = $"{DefaultFilesSubdir}/{slug}{n}{ext}";
            try
            {
                relativePath = XActionFileRefPath.NormalizeRelativePath(relativePath);
                resourceFiles.Add(new ActionProjectResourceFile
                {
                    RelativePath = relativePath,
                    Content = value,
                });

                paramObj.Remove("value");
                paramObj["file"] = relativePath;
            }
            catch (Exception ex)
            {
                warnings.Add($"auto file ref ({stepRunnerKey}.{prop.Name}): {ex.Message}");
            }
        }
    }

    private static void ExternalizeVariables(
        JArray variables,
        int minLines,
        int minChars,
        Dictionary<string, int> slugCounters,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings)
    {
        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            VariableDefaultValueRef.MigrateLegacyFileProperty(varObj);

            if (VariableDefaultValueRef.HasFileRef(varObj))
            {
                continue;
            }

            var value = ReadVariableDefaultValue(varObj);
            if (value is null || !ShouldExternalizeVariableDefault(value, minLines, minChars))
            {
                continue;
            }

            var varKey = varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? "var";
            var slug = SanitizeSlug(varKey);
            if (slug.Length == 0)
            {
                slug = "var";
            }

            if (!slugCounters.TryGetValue(slug, out var n))
            {
                n = 0;
            }

            n++;
            slugCounters[slug] = n;

            var relativePath = $"{DefaultFilesSubdir}/{slug}-default{n}.txt";
            try
            {
                relativePath = XActionFileRefPath.NormalizeRelativePath(relativePath);
                resourceFiles.Add(new ActionProjectResourceFile
                {
                    RelativePath = relativePath,
                    Content = value,
                });

                VariableDefaultValueRef.SetFileRef(varObj, relativePath);
            }
            catch (Exception ex)
            {
                warnings.Add($"auto file ref (variable {varKey}.defaultValue): {ex.Message}");
            }
        }
    }

    internal static bool ShouldExternalizeVariableDefault(string value, int minLines, int minChars)
    {
        if (minLines > 0 && ShouldExternalizeByLines(value, minLines))
        {
            return true;
        }

        return minChars > 0 && value.Length > minChars;
    }

    internal static bool ShouldExternalizeByLines(string value, int minLines) =>
        minLines > 0 && CountLines(value) > minLines;

    private static string? ReadVariableDefaultValue(JObject varObj) =>
        VariableDefaultValueRef.TryGetInlineString(varObj, out var inline)
            ? inline
            : null;

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }

    internal static int CountLines(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return 0;
        }

        var lines = 1;
        for (var i = 0; i < value.Length; i++)
        {
            if (value[i] == '\n')
            {
                lines++;
            }
        }

        return lines;
    }

    internal static string ModuleSlug(string stepRunnerKey, string paramKey)
    {
        var raw = (stepRunnerKey ?? string.Empty).Trim();
        if (raw.StartsWith("sys:", StringComparison.OrdinalIgnoreCase))
        {
            raw = raw.Substring(4);
        }

        var segment = raw.Split(new[] { '.', ':', '/' }, StringSplitOptions.RemoveEmptyEntries).LastOrDefault()
            ?? string.Empty;
        segment = SanitizeSlug(segment);

        if (segment.Length == 0)
        {
            segment = SanitizeSlug(paramKey);
        }

        if (segment.Length == 0)
        {
            segment = "text";
        }

        return segment;
    }

    internal static string GuessExtension(
        string stepRunnerKey,
        string paramKey,
        JObject? inputParams = null,
        string? content = null) =>
        StepRunnerResourceFileExtensions.Guess(stepRunnerKey, paramKey, inputParams, content);

    private static string SanitizeSlug(string raw)
    {
        var chars = raw
            .Trim()
            .Where(c => char.IsLetterOrDigit(c) || c is '-' or '_')
            .ToArray();
        return new string(chars).ToLowerInvariant();
    }
}
