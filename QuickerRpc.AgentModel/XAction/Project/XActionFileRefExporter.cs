using System;
using System.Collections.Generic;
using System.IO;
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

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    private sealed class FileRefSlot
    {
        public string StepId { get; set; } = "";

        public string ParamKey { get; set; } = "";

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
        var writtenFiles = new List<string>();

        if (templateData is null)
        {
            var autoOnly = ApplyAutoExternalize(output, projectDir, options, writtenFiles, warnings);
            if (autoOnly is not null)
            {
                return autoOnly;
            }

            return new ExportResult
            {
                Success = true,
                ExportedData = output,
                WrittenFiles = writtenFiles,
                Warnings = warnings,
            };
        }

        if (templateData["steps"] is not JArray templateSteps)
        {
            return Fail("template data.json steps must be an array.");
        }

        var fileRefs = CollectFileRefs(templateSteps);
        foreach (var slot in fileRefs)
        {
            if (!valueIndex.TryGetValue(slot.StepId, out var paramMap)
                || !paramMap.TryGetValue(slot.ParamKey, out var value))
            {
                warnings.Add(
                    $"file ref {slot.RelativeFile} (step {slot.StepId}, {slot.ParamKey}): no matching value in latest program.");
                continue;
            }

            try
            {
                var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, slot.RelativeFile);
                var dir = Path.GetDirectoryName(fullPath);
                if (!string.IsNullOrEmpty(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                File.WriteAllText(fullPath, value, System.Text.Encoding.UTF8);
                writtenFiles.Add(slot.RelativeFile);

                if (!TryApplyFileRef(output["steps"] as JArray, slot))
                {
                    warnings.Add(
                        $"file ref {slot.RelativeFile} (step {slot.StepId}, {slot.ParamKey}): step not found in latest program.");
                }
            }
            catch (Exception ex)
            {
                return Fail($"failed to write {slot.RelativeFile}: {ex.Message}");
            }
        }

        var autoFail = ApplyAutoExternalize(output, projectDir, options, writtenFiles, warnings);
        if (autoFail is not null)
        {
            return autoFail;
        }

        return new ExportResult
        {
            Success = true,
            ExportedData = output,
            WrittenFiles = writtenFiles,
            Warnings = warnings,
        };
    }

    private static ExportResult? ApplyAutoExternalize(
        JObject output,
        string projectDir,
        XActionFileRefExportOptions? options,
        List<string> writtenFiles,
        List<string> warnings)
    {
        var minLines = options?.AutoExternalizeMinLines ?? 0;
        if (minLines <= 0)
        {
            return null;
        }

        var auto = XActionFileRefAutoExternalizer.Apply(output, projectDir, minLines);
        writtenFiles.AddRange(auto.WrittenFiles);
        warnings.AddRange(auto.Warnings);
        return null;
    }

    private static bool TryApplyFileRef(JArray? steps, FileRefSlot slot)
    {
        if (steps is null)
        {
            return false;
        }

        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepId = step.Value<string>("stepId") ?? "";
            if (string.Equals(stepId, slot.StepId, StringComparison.OrdinalIgnoreCase)
                && step["inputParams"] is JObject inputParams
                && inputParams[slot.ParamKey] is JObject paramObj)
            {
                paramObj.Remove("value");
                paramObj.Remove("varKey");
                paramObj["file"] = slot.RelativeFile;
                return true;
            }

            if (step["ifSteps"] is JArray ifSteps && TryApplyFileRef(ifSteps, slot))
            {
                return true;
            }

            if (step["elseSteps"] is JArray elseSteps && TryApplyFileRef(elseSteps, slot))
            {
                return true;
            }
        }

        return false;
    }

    private static Dictionary<string, Dictionary<string, string>> BuildValueIndex(JArray steps)
    {
        var index = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
        IndexSteps(steps, index);
        return index;
    }

    private static void IndexSteps(JArray steps, Dictionary<string, Dictionary<string, string>> index)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepId = step.Value<string>("stepId");
            if (!string.IsNullOrWhiteSpace(stepId) && step["inputParams"] is JObject inputParams)
            {
                if (!index.TryGetValue(stepId, out var paramMap))
                {
                    paramMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    index[stepId] = paramMap;
                }

                foreach (var prop in inputParams.Properties())
                {
                    if (prop.Value is not JObject paramObj)
                    {
                        continue;
                    }

                    var value = paramObj.Value<string>("value") ?? "";
                    paramMap[prop.Name] = value;
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                IndexSteps(ifSteps, index);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                IndexSteps(elseSteps, index);
            }
        }
    }

    private static List<FileRefSlot> CollectFileRefs(JArray steps)
    {
        var list = new List<FileRefSlot>();
        CollectFileRefsRecursive(steps, list);
        return list;
    }

    private static void CollectFileRefsRecursive(JArray steps, List<FileRefSlot> list)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepId = step.Value<string>("stepId");
            if (!string.IsNullOrWhiteSpace(stepId) && step["inputParams"] is JObject inputParams)
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
                            StepId = stepId,
                            ParamKey = prop.Name,
                            RelativeFile = XActionFileRefPath.NormalizeRelativePath(file),
                        });
                    }
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                CollectFileRefsRecursive(ifSteps, list);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                CollectFileRefsRecursive(elseSteps, list);
            }
        }
    }

    private static ExportResult Fail(string message) =>
        new ExportResult { Success = false, ErrorMessage = message };
}
