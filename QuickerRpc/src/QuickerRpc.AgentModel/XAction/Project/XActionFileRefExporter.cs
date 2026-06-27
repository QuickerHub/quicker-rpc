using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Exports RPC program JSON to <c>data.json</c>, preserving existing <c>file</c> refs and writing resource files.
/// </summary>
public static class XActionFileRefExporter
{
    public sealed class ExportResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public JObject? ExportedData { get; set; }

        public IReadOnlyList<string> WrittenFiles { get; set; } = Array.Empty<string>();

        public IReadOnlyList<ActionProjectResourceFile> ResourceFiles { get; set; } =
            Array.Empty<ActionProjectResourceFile>();

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    private sealed class FileRefSlot
    {
        public string StepId { get; set; } = string.Empty;

        public string NodePath { get; set; } = string.Empty;

        public string ParamKey { get; set; } = "";

        public string RelativeFile { get; set; } = "";
    }

    private sealed class VariableFileRefSlot
    {
        public string Key { get; set; } = "";

        public string RelativeFile { get; set; } = "";
    }

    public static ExportResult Export(
        JObject latestData,
        string projectDirectory,
        JObject? templateData = null,
        XActionFileRefExportOptions? options = null)
    {
        if (latestData["steps"] is not JArray latestSteps)
        {
            return Fail("latest program steps must be an array.");
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var output = (JObject)latestData.DeepClone();
        var valueIndex = BuildValueIndex(latestSteps);
        var warnings = new List<string>();
        var resourceFiles = new List<ActionProjectResourceFile>();

        if (templateData is not null)
        {
            AppendCompatibilityFixes(warnings, WorkspaceProgramCompatibility.Normalize(templateData));
        }

        XActionFormDefReversibleExporter.Apply(output, templateData, resourceFiles, warnings, projectDir);
        ActionProjectFormDefFileExporter.EnsureUtf8FormDefResourceFiles(output, projectDir, resourceFiles);

        if (templateData is null)
        {
            var autoOnly = ApplyAutoExternalize(output, projectDir, options, resourceFiles, warnings);
            if (autoOnly is not null)
            {
                return autoOnly;
            }

            return BuildSuccess(output, resourceFiles, warnings);
        }

        if (templateData["steps"] is not JArray templateSteps)
        {
            return Fail("template data.json steps must be an array.");
        }

        var fileRefs = CollectFileRefs(templateSteps);
        var variableFileRefs = CollectVariableFileRefs(templateData["variables"] as JArray);
        var variableDefaults = BuildVariableDefaultIndex(output["variables"] as JArray);

        foreach (var slot in variableFileRefs)
        {
            if (!variableDefaults.TryGetValue(slot.Key, out var value))
            {
                warnings.Add(
                    $"file ref {slot.RelativeFile} (variable {slot.Key}, defaultValue): no matching default in latest program.");
                continue;
            }

            try
            {
                resourceFiles.Add(new ActionProjectResourceFile
                {
                    RelativePath = slot.RelativeFile,
                    Content = value,
                });

                if (!TryApplyVariableFileRef(output["variables"] as JArray, slot))
                {
                    warnings.Add(
                        $"file ref {slot.RelativeFile} (variable {slot.Key}): variable not found in latest program.");
                }
            }
            catch (Exception ex)
            {
                return Fail($"failed to write {slot.RelativeFile}: {ex.Message}");
            }
        }

        foreach (var slot in fileRefs)
        {
            if (XActionFormDefReversibleExporter.IsFormDefParamKey(slot.ParamKey))
            {
                continue;
            }

            if (!TryFindValueMap(valueIndex, slot, out var paramMap)
                || !paramMap.TryGetValue(slot.ParamKey, out var value))
            {
                warnings.Add(
                    $"file ref {slot.RelativeFile} (step {FormatStepSlot(slot)}, {slot.ParamKey}): no matching value in latest program.");
                continue;
            }

            try
            {
                resourceFiles.Add(new ActionProjectResourceFile
                {
                    RelativePath = slot.RelativeFile,
                    Content = value,
                });

                if (!TryApplyFileRef(output["steps"] as JArray, slot))
                {
                    warnings.Add(
                        $"file ref {slot.RelativeFile} (step {FormatStepSlot(slot)}, {slot.ParamKey}): step not found in latest program.");
                }
            }
            catch (Exception ex)
            {
                return Fail($"failed to write {slot.RelativeFile}: {ex.Message}");
            }
        }

        var autoFail = ApplyAutoExternalize(output, projectDir, options, resourceFiles, warnings);
        if (autoFail is not null)
        {
            return autoFail;
        }

        ActionProjectFormDefFileExporter.EnsureUtf8FormDefResourceFiles(output, projectDir, resourceFiles);
        return BuildSuccess(output, resourceFiles, warnings);
    }

    private static ExportResult BuildSuccess(
        JObject output,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings)
    {
        AppendCompatibilityFixes(warnings, WorkspaceProgramCompatibility.Normalize(output));
        return new ExportResult
        {
            Success = true,
            ExportedData = output,
            ResourceFiles = resourceFiles,
            WrittenFiles = resourceFiles
                .Select(f => XActionFileRefPath.NormalizeRelativePath(f.RelativePath))
                .ToList(),
            Warnings = warnings,
        };
    }

    private static void AppendCompatibilityFixes(
        List<string> warnings,
        IReadOnlyList<string> fixes)
    {
        foreach (var fix in fixes)
        {
            warnings.Add($"compatibility: {fix}");
        }
    }

    private static ExportResult? ApplyAutoExternalize(
        JObject output,
        string projectDir,
        XActionFileRefExportOptions? options,
        List<ActionProjectResourceFile> resourceFiles,
        List<string> warnings)
    {
        var minLines = options?.AutoExternalizeMinLines ?? 0;
        if (minLines <= 0)
        {
            return null;
        }

        var minChars = options?.AutoExternalizeMinChars ?? 0;
        var auto = XActionFileRefAutoExternalizer.Apply(output, projectDir, minLines, minChars);
        resourceFiles.AddRange(auto.ResourceFiles);
        warnings.AddRange(auto.Warnings);
        return null;
    }

    private static bool TryApplyFileRef(JArray? steps, FileRefSlot slot) =>
        TryApplyFileRef(steps, slot, string.Empty);

    private static bool TryApplyFileRef(JArray? steps, FileRefSlot slot, string parentPath)
    {
        if (steps is null)
        {
            return false;
        }

        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var nodePath = BuildNodePath(parentPath, i);
            var stepId = step.Value<string>("stepId") ?? "";
            var matched = !string.IsNullOrWhiteSpace(slot.StepId)
                ? string.Equals(stepId, slot.StepId, StringComparison.OrdinalIgnoreCase)
                : string.Equals(nodePath, slot.NodePath, StringComparison.Ordinal);
            if (matched
                && step["inputParams"] is JObject inputParams
                && inputParams[slot.ParamKey] is JObject paramObj)
            {
                paramObj.Remove("value");
                paramObj.Remove("varKey");
                paramObj["file"] = slot.RelativeFile;
                return true;
            }

            if (step["ifSteps"] is JArray ifSteps && TryApplyFileRef(ifSteps, slot, nodePath + "/if"))
            {
                return true;
            }

            if (step["elseSteps"] is JArray elseSteps && TryApplyFileRef(elseSteps, slot, nodePath + "/else"))
            {
                return true;
            }
        }

        return false;
    }

    private sealed class ValueIndex
    {
        public Dictionary<string, Dictionary<string, string>> ByStepId { get; } =
            new(StringComparer.OrdinalIgnoreCase);

        public Dictionary<string, Dictionary<string, string>> ByNodePath { get; } =
            new(StringComparer.Ordinal);
    }

    private static ValueIndex BuildValueIndex(JArray steps)
    {
        var index = new ValueIndex();
        IndexSteps(steps, index, string.Empty);
        return index;
    }

    private static void IndexSteps(JArray steps, ValueIndex index, string parentPath)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var nodePath = BuildNodePath(parentPath, i);
            var stepId = step.Value<string>("stepId");
            if (step["inputParams"] is JObject inputParams)
            {
                var paramMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var prop in inputParams.Properties())
                {
                    if (prop.Value is not JObject paramObj)
                    {
                        continue;
                    }

                    var value = paramObj.Value<string>("value") ?? "";
                    paramMap[prop.Name] = value;
                }

                index.ByNodePath[nodePath] = paramMap;
                if (!string.IsNullOrWhiteSpace(stepId))
                {
                    index.ByStepId[stepId] = paramMap;
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                IndexSteps(ifSteps, index, nodePath + "/if");
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                IndexSteps(elseSteps, index, nodePath + "/else");
            }
        }
    }

    private static bool TryFindValueMap(
        ValueIndex index,
        FileRefSlot slot,
        out Dictionary<string, string> paramMap)
    {
        if (!string.IsNullOrWhiteSpace(slot.StepId)
            && index.ByStepId.TryGetValue(slot.StepId, out paramMap!))
        {
            return true;
        }

        return index.ByNodePath.TryGetValue(slot.NodePath, out paramMap!);
    }

    private static List<FileRefSlot> CollectFileRefs(JArray steps)
    {
        var list = new List<FileRefSlot>();
        CollectFileRefsRecursive(steps, list, string.Empty);
        return list;
    }

    private static void CollectFileRefsRecursive(JArray steps, List<FileRefSlot> list, string parentPath)
    {
        for (var i = 0; i < steps.Count; i++)
        {
            if (steps[i] is not JObject step)
            {
                continue;
            }

            var nodePath = BuildNodePath(parentPath, i);
            var stepId = step.Value<string>("stepId");
            if (step["inputParams"] is JObject inputParams)
            {
                foreach (var prop in inputParams.Properties())
                {
                    if (prop.Value is not JObject paramObj)
                    {
                        continue;
                    }

                    var file = paramObj.Value<string>("file")?.Trim();
                    if (!string.IsNullOrEmpty(file))
                    {
                        list.Add(new FileRefSlot
                        {
                            StepId = stepId ?? string.Empty,
                            NodePath = nodePath,
                            ParamKey = prop.Name,
                            RelativeFile = XActionFileRefPath.NormalizeRelativePath(file),
                        });
                    }
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                CollectFileRefsRecursive(ifSteps, list, nodePath + "/if");
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                CollectFileRefsRecursive(elseSteps, list, nodePath + "/else");
            }
        }
    }

    private static string BuildNodePath(string parentPath, int index) =>
        string.IsNullOrEmpty(parentPath) ? index.ToString() : parentPath + "/" + index;

    private static string FormatStepSlot(FileRefSlot slot) =>
        string.IsNullOrWhiteSpace(slot.StepId) ? slot.NodePath : slot.StepId;

    private static Dictionary<string, string> BuildVariableDefaultIndex(JArray? variables)
    {
        var index = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (variables is null)
        {
            return index;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = varObj.Value<string>("key") ?? varObj.Value<string>("Key");
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            index[key] = VariableDefaultValueRef.TryGetInlineString(varObj, out var inline)
                ? inline ?? string.Empty
                : string.Empty;
        }

        return index;
    }

    private static List<VariableFileRefSlot> CollectVariableFileRefs(JArray? variables)
    {
        var list = new List<VariableFileRefSlot>();
        if (variables is null)
        {
            return list;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = varObj.Value<string>("key") ?? varObj.Value<string>("Key");
            if (string.IsNullOrWhiteSpace(key)
                || !VariableDefaultValueRef.TryGetFilePath(varObj, out var file)
                || string.IsNullOrEmpty(file))
            {
                continue;
            }

            list.Add(new VariableFileRefSlot
            {
                Key = key,
                RelativeFile = XActionFileRefPath.NormalizeRelativePath(file),
            });
        }

        return list;
    }

    private static bool TryApplyVariableFileRef(JArray? variables, VariableFileRefSlot slot)
    {
        if (variables is null)
        {
            return false;
        }

        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var key = varObj.Value<string>("key") ?? varObj.Value<string>("Key");
            if (!string.Equals(key, slot.Key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            VariableDefaultValueRef.SetFileRef(varObj, slot.RelativeFile);
            return true;
        }

        return false;
    }

    private static ExportResult Fail(string message) =>
        new ExportResult { Success = false, ErrorMessage = message };
}
