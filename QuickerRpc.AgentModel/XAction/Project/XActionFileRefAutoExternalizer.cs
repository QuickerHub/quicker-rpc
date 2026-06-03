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

    public sealed class ApplyResult
    {
        public IReadOnlyList<string> WrittenFiles { get; set; } = Array.Empty<string>();

        public IReadOnlyList<ActionProjectResourceFile> ResourceFiles { get; set; } =
            Array.Empty<ActionProjectResourceFile>();

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    public static ApplyResult Apply(JObject data, string projectDirectory, int minLines)
    {
        if (minLines <= 0)
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

        ExternalizeSteps(steps, projectDir, minLines, slugCounters, resourceFiles, warnings);

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

            if (paramObj["varKey"] is not null && paramObj["varKey"].Type != JTokenType.Null)
            {
                continue;
            }

            var value = paramObj.Value<string>("value");
            if (value is null || CountLines(value) <= minLines)
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

            var ext = GuessExtension(stepRunnerKey, prop.Name);
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

    internal static string GuessExtension(string stepRunnerKey, string paramKey)
    {
        var runner = (stepRunnerKey ?? string.Empty).ToLowerInvariant();
        var param = (paramKey ?? string.Empty).ToLowerInvariant();

        if (runner.Contains("evalexpression"))
        {
            return ".eval.cs";
        }

        if (runner.Contains("csscript") || param is "code" or "script")
        {
            return ".cs";
        }

        if (runner.Contains("pythonscript"))
        {
            return ".py";
        }

        if (runner.Contains("jsscript"))
        {
            return ".js";
        }

        if (runner.Contains("runscript"))
        {
            return ".ps1";
        }

        if (param.Contains("html"))
        {
            return ".html";
        }

        if (param.Contains("json"))
        {
            return ".json";
        }

        return ".txt";
    }

    private static string SanitizeSlug(string raw)
    {
        var chars = raw
            .Trim()
            .Where(c => char.IsLetterOrDigit(c) || c is '-' or '_')
            .ToArray();
        return new string(chars).ToLowerInvariant();
    }
}
