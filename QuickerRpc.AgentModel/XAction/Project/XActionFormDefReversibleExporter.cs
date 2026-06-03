using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// On extract/export, converts native <c>formDef.value</c> to <c>formDef.file</c> + <c>qkrpc.form.v1</c> for round-trip editing.
/// </summary>
public static class XActionFormDefReversibleExporter
{
    private const string FormStepRunnerKey = "sys:form";

    private static readonly string[] FormParamKeys = ["formDef", "dynamicFormForDictDef"];

    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public static void Apply(
        JObject outputData,
        JObject? templateData,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings,
        string? projectDirectory = null)
    {
        if (outputData["steps"] is not JArray steps)
        {
            return;
        }

        var templatePaths = BuildTemplatePathIndex(templateData);
        var slugCounters = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var projectDir = string.IsNullOrWhiteSpace(projectDirectory)
            ? null
            : QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);

        ApplySteps(steps, templatePaths, slugCounters, resourceFiles, warnings, projectDir);
    }

    private static void ApplySteps(
        JArray steps,
        Dictionary<string, string> templatePaths,
        Dictionary<string, int> slugCounters,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings,
        string? projectDir)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (string.Equals(step.Value<string>("stepRunnerKey"), FormStepRunnerKey, StringComparison.Ordinal))
            {
                TryExportStepFormDefs(step, templatePaths, slugCounters, resourceFiles, warnings, projectDir);
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                ApplySteps(ifSteps, templatePaths, slugCounters, resourceFiles, warnings, projectDir);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                ApplySteps(elseSteps, templatePaths, slugCounters, resourceFiles, warnings, projectDir);
            }
        }
    }

    private static void TryExportStepFormDefs(
        JObject step,
        Dictionary<string, string> templatePaths,
        Dictionary<string, int> slugCounters,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings,
        string? projectDir)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        var stepId = step.Value<string>("stepId") ?? "";
        var context = FormSpecDecompiler.ReadContextFromStep(step);

        foreach (var paramKey in FormParamKeys)
        {
            if (inputParams[paramKey] is not JObject paramObj)
            {
                continue;
            }

            var value = paramObj.Value<string>("value");
            var refreshFileOnly = string.IsNullOrWhiteSpace(value);
            if (refreshFileOnly)
            {
                value = TryReadFormDefFileContent(paramObj, projectDir);
                if (string.IsNullOrWhiteSpace(value))
                {
                    continue;
                }
            }

            if (!FormSpecDecompiler.LooksLikeNativeFormDef(value)
                && !FormSpecDocumentShape.LooksLikeFormSpecText(value))
            {
                continue;
            }

            try
            {
                var specContent = FormSpecDecompiler.NormalizeToSpecFileContent(value, context, warnings);
                var relativePath = ResolveRelativePath(
                    stepId,
                    paramKey,
                    paramObj,
                    templatePaths,
                    step.Value<string>("stepRunnerKey") ?? FormStepRunnerKey,
                    slugCounters);

                ActionProjectFormDefFileExporter.UpsertResourceFile(resourceFiles, relativePath, specContent);
                if (!refreshFileOnly)
                {
                    paramObj.Remove("value");
                    paramObj.Remove("varKey");
                    paramObj["file"] = relativePath;
                }
            }
            catch (Exception ex)
            {
                warnings.Add($"form reversible export (step {stepId}, {paramKey}): {ex.Message}");
            }
        }
    }

    private static string? TryReadFormDefFileContent(JObject paramObj, string? projectDir)
    {
        if (string.IsNullOrWhiteSpace(projectDir))
        {
            return null;
        }

        var file = paramObj.Value<string>("file")?.Trim();
        if (string.IsNullOrEmpty(file) || !FormSpecDocumentShape.LooksLikeFormSpecFile(file))
        {
            return null;
        }

        var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, file);
        if (!File.Exists(fullPath))
        {
            return null;
        }

        return File.ReadAllText(fullPath, Utf8NoBom);
    }

    private static string ResolveRelativePath(
        string stepId,
        string paramKey,
        JObject paramObj,
        Dictionary<string, string> templatePaths,
        string stepRunnerKey,
        Dictionary<string, int> slugCounters)
    {
        var existing = paramObj.Value<string>("file")?.Trim();
        if (!string.IsNullOrEmpty(existing)
            && FormSpecDocumentShape.LooksLikeFormSpecFile(existing))
        {
            return XActionFileRefPath.NormalizeRelativePath(existing);
        }

        var templateKey = BuildTemplateKey(stepId, paramKey);
        if (templatePaths.TryGetValue(templateKey, out var templatePath)
            && FormSpecDocumentShape.LooksLikeFormSpecFile(templatePath))
        {
            return templatePath;
        }

        var slug = XActionFileRefAutoExternalizer.ModuleSlug(stepRunnerKey, paramKey);
        if (!slugCounters.TryGetValue(slug, out var n))
        {
            n = 0;
        }

        n++;
        slugCounters[slug] = n;
        return XActionFileRefPath.NormalizeRelativePath(
            $"{XActionFileRefAutoExternalizer.DefaultFilesSubdir}/{slug}{n}.form.json");
    }

    private static Dictionary<string, string> BuildTemplatePathIndex(JObject? templateData)
    {
        var index = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (templateData?["steps"] is not JArray templateSteps)
        {
            return index;
        }

        IndexTemplatePaths(templateSteps, index);
        return index;
    }

    private static void IndexTemplatePaths(JArray steps, Dictionary<string, string> index)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepId = step.Value<string>("stepId") ?? "";
            if (!string.IsNullOrWhiteSpace(stepId) && step["inputParams"] is JObject inputParams)
            {
                foreach (var paramKey in FormParamKeys)
                {
                    if (inputParams[paramKey] is not JObject paramObj)
                    {
                        continue;
                    }

                    var file = paramObj.Value<string>("file")?.Trim();
                    if (!string.IsNullOrEmpty(file))
                    {
                        index[BuildTemplateKey(stepId, paramKey)] =
                            XActionFileRefPath.NormalizeRelativePath(file);
                    }
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                IndexTemplatePaths(ifSteps, index);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                IndexTemplatePaths(elseSteps, index);
            }
        }
    }

    private static string BuildTemplateKey(string stepId, string paramKey) =>
        stepId + "\0" + paramKey;

    public static bool IsFormDefParamKey(string paramKey) =>
        string.Equals(paramKey, "formDef", StringComparison.OrdinalIgnoreCase)
        || string.Equals(paramKey, "dynamicFormForDictDef", StringComparison.OrdinalIgnoreCase);
}
