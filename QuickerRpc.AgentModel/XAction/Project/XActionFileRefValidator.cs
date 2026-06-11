using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Dry-run validation for local action projects (compile file refs, catalog files).</summary>
public static class XActionFileRefValidator
{
    public sealed class FileRefEntry
    {
        public string StepRef { get; set; } = string.Empty;

        public string ParamName { get; set; } = string.Empty;

        public string RelativePath { get; set; } = string.Empty;

        public bool Exists { get; set; }

        public long? SizeBytes { get; set; }
    }

    public sealed class ValidateResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public int StepCount { get; set; }

        public int VariableCount { get; set; }

        public IList<FileRefEntry> FileRefs { get; set; } = Array.Empty<FileRefEntry>();

        public IList<ProgramWireSchemaValidator.SchemaIssue> SchemaIssues { get; set; } =
            Array.Empty<ProgramWireSchemaValidator.SchemaIssue>();
    }

    public static ValidateResult Validate(JObject data, string projectDirectory)
    {
        var steps = data["steps"] as JArray;
        var variables = data["variables"] as JArray;
        if (steps is null)
        {
            return Fail("data.json steps must be an array.");
        }

        if (variables is null)
        {
            return Fail("data.json variables must be an array.");
        }

        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var fileRefs = CollectFileRefs(data, projectDir);
        var schemaIssues = ProgramWireSchemaValidator.Validate(ReadRawDataForSchemaCheck(projectDir) ?? data);
        if (schemaIssues.Count > 0)
        {
            return new ValidateResult
            {
                Success = false,
                ErrorMessage = ProgramWireSchemaValidator.FormatMessage(schemaIssues),
                StepCount = steps.Count,
                VariableCount = variables.Count,
                FileRefs = fileRefs,
                SchemaIssues = schemaIssues,
            };
        }

        var compileResult = XActionFileRefCompiler.Compile(data, projectDir);
        if (!compileResult.Success)
        {
            return new ValidateResult
            {
                Success = false,
                ErrorMessage = compileResult.ErrorMessage,
                StepCount = steps.Count,
                VariableCount = variables.Count,
                FileRefs = fileRefs,
            };
        }

        return new ValidateResult
        {
            Success = true,
            StepCount = steps.Count,
            VariableCount = variables.Count,
            FileRefs = fileRefs,
        };
    }

    /// <summary>
    /// Re-reads raw data.json (no wire expansion) so schema issues carry accurate
    /// line numbers and original key spellings. Returns null when unavailable.
    /// </summary>
    private static JObject? ReadRawDataForSchemaCheck(string projectDir)
    {
        try
        {
            var path = QuickerProjectLayout.GetDataPath(projectDir);
            if (!File.Exists(path))
            {
                return null;
            }

            return QuickerProjectFiles.TryParseDataRoot(File.ReadAllText(path), out var root, out _)
                ? root
                : null;
        }
        catch
        {
            return null;
        }
    }

    public static IList<FileRefEntry> CollectFileRefs(JObject data, string projectDirectory)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var entries = new List<FileRefEntry>();
        if (data["steps"] is JArray steps)
        {
            CollectFileRefsFromSteps(steps, projectDir, entries);
        }

        if (data["variables"] is JArray variables)
        {
            CollectFileRefsFromVariables(variables, projectDir, entries);
        }

        return entries;
    }

    private static void CollectFileRefsFromVariables(
        JArray variables,
        string projectDir,
        IList<FileRefEntry> entries)
    {
        foreach (var token in variables)
        {
            if (token is not JObject varObj)
            {
                continue;
            }

            var varKey = varObj.Value<string>("key") ?? varObj.Value<string>("Key") ?? "variable";
            if (!VariableDefaultValueRef.TryGetFilePath(varObj, out var relativePath))
            {
                continue;
            }

            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, relativePath!);
            long? sizeBytes = null;
            var exists = File.Exists(fullPath);
            if (exists)
            {
                sizeBytes = new FileInfo(fullPath).Length;
            }

            entries.Add(new FileRefEntry
            {
                StepRef = $"variable {varKey}",
                ParamName = "defaultValue",
                RelativePath = relativePath!,
                Exists = exists,
                SizeBytes = sizeBytes,
            });
        }
    }

    private static void CollectFileRefsFromSteps(JArray steps, string projectDir, IList<FileRefEntry> entries)
    {
        foreach (var token in steps)
        {
            if (token is not JObject step)
            {
                continue;
            }

            var stepRef = DescribeStep(step);
            if (step["inputParams"] is JObject inputParams)
            {
                foreach (var prop in inputParams.Properties())
                {
                    if (prop.Value is not JObject paramObj)
                    {
                        continue;
                    }

                    if (!TryReadNonEmptyString(paramObj["file"], out var relativePath))
                    {
                        continue;
                    }

                    var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, relativePath!);
                    long? sizeBytes = null;
                    var exists = File.Exists(fullPath);
                    if (exists)
                    {
                        sizeBytes = new FileInfo(fullPath).Length;
                    }

                    entries.Add(new FileRefEntry
                    {
                        StepRef = stepRef,
                        ParamName = prop.Name,
                        RelativePath = relativePath!,
                        Exists = exists,
                        SizeBytes = sizeBytes,
                    });
                }
            }

            if (step["ifSteps"] is JArray ifSteps)
            {
                CollectFileRefsFromSteps(ifSteps, projectDir, entries);
            }

            if (step["elseSteps"] is JArray elseSteps)
            {
                CollectFileRefsFromSteps(elseSteps, projectDir, entries);
            }
        }
    }

    private static string DescribeStep(JObject step)
    {
        var stepId = step.Value<string>("stepId");
        var runner = step.Value<string>("stepRunnerKey");
        if (!string.IsNullOrWhiteSpace(stepId))
        {
            return $"step {stepId}";
        }

        if (!string.IsNullOrWhiteSpace(runner))
        {
            return $"step ({runner})";
        }

        return "step";
    }

    private static bool TryReadNonEmptyString(JToken? token, out string? value)
    {
        value = token?.Type == JTokenType.String ? token.Value<string>()?.Trim() : null;
        return !string.IsNullOrEmpty(value);
    }

    private static ValidateResult Fail(string message) =>
        new ValidateResult { Success = false, ErrorMessage = message };
}
