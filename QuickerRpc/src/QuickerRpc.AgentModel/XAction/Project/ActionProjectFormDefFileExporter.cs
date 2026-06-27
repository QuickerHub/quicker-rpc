using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Ensures every <c>formDef.file</c> / <c>*.form.json</c> is written with literal UTF-8 CJK.</summary>
public static class ActionProjectFormDefFileExporter
{
    private const string FormStepRunnerKey = "sys:form";

    private static readonly string[] FormParamKeys = ["formDef", "dynamicFormForDictDef"];

    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public static void EnsureUtf8FormDefResourceFiles(
        JObject outputData,
        string projectDirectory,
        List<ActionProjectResourceFile> resourceFiles)
    {
        if (outputData["steps"] is not JArray steps)
        {
            return;
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        EnsureUtf8FormDefResourceFilesFromSteps(steps, projectDir, resourceFiles);
    }

    private static void EnsureUtf8FormDefResourceFilesFromSteps(
        JArray steps,
        string projectDir,
        List<ActionProjectResourceFile> resourceFiles)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            if (string.Equals(step.Value<string>("stepRunnerKey"), FormStepRunnerKey, StringComparison.Ordinal))
            {
                TryEnsureStepFormDefFiles(step, projectDir, resourceFiles);
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                EnsureUtf8FormDefResourceFilesFromSteps(ifSteps, projectDir, resourceFiles);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                EnsureUtf8FormDefResourceFilesFromSteps(elseSteps, projectDir, resourceFiles);
            }
        }
    }

    private static void TryEnsureStepFormDefFiles(
        JObject step,
        string projectDir,
        List<ActionProjectResourceFile> resourceFiles)
    {
        if (step["inputParams"] is not JObject inputParams)
        {
            return;
        }

        foreach (var paramKey in FormParamKeys)
        {
            if (inputParams[paramKey] is not JObject paramObj)
            {
                continue;
            }

            var relativePath = paramObj.Value<string>("file")?.Trim();
            if (string.IsNullOrEmpty(relativePath)
                || !FormSpecDocumentShape.LooksLikeFormSpecFile(relativePath))
            {
                continue;
            }

            var content = TryGetResourceContent(resourceFiles, relativePath)
                ?? TryReadProjectFile(projectDir, relativePath);
            if (string.IsNullOrWhiteSpace(content))
            {
                continue;
            }

            var normalized = FormSpecDecompiler.NormalizeFormSpecFileContent(content);
            if (!FormSpecDocumentShape.LooksLikeFormSpecText(normalized))
            {
                continue;
            }

            UpsertResourceFile(resourceFiles, relativePath, normalized);
        }
    }

    private static string? TryGetResourceContent(
        List<ActionProjectResourceFile> resourceFiles,
        string relativePath)
    {
        var normalized = XActionFileRefPath.NormalizeRelativePath(relativePath);
        var existing = resourceFiles.FirstOrDefault(
            f => string.Equals(
                XActionFileRefPath.NormalizeRelativePath(f.RelativePath),
                normalized,
                StringComparison.OrdinalIgnoreCase));
        return existing?.Content;
    }

    private static string? TryReadProjectFile(string projectDir, string relativePath)
    {
        var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, relativePath);
        if (!File.Exists(fullPath))
        {
            return null;
        }

        return File.ReadAllText(fullPath, Utf8NoBom);
    }

    public static void UpsertResourceFile(
        List<ActionProjectResourceFile> resourceFiles,
        string relativePath,
        string content)
    {
        var normalized = XActionFileRefPath.NormalizeRelativePath(relativePath);
        var existing = resourceFiles.FirstOrDefault(
            f => string.Equals(
                XActionFileRefPath.NormalizeRelativePath(f.RelativePath),
                normalized,
                StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            existing.Content = content;
            return;
        }

        resourceFiles.Add(new ActionProjectResourceFile
        {
            RelativePath = normalized,
            Content = content,
        });
    }
}
