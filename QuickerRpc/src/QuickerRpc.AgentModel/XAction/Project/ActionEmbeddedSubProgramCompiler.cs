using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Compression;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Assembles action-embedded subprograms from <c>subprograms/{id}/</c> trees for RPC apply.
/// </summary>
public static class ActionEmbeddedSubProgramCompiler
{
    public sealed class CompileResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public JArray SubPrograms { get; set; } = new();

        public int SubProgramCount { get; set; }
    }

    public static CompileResult Compile(string actionProjectDirectory, StepRunnerCatalog? catalog = null)
    {
        var actionDir = QuickerProjectLayout.ResolveProjectDirectory(actionProjectDirectory);
        var root = QuickerProjectLayout.GetActionEmbeddedSubProgramsRoot(actionDir);
        if (!Directory.Exists(root))
        {
            return new CompileResult { Success = true, SubPrograms = new JArray(), SubProgramCount = 0 };
        }

        try
        {
            var subPrograms = CompileDirectory(root, catalog);
            return new CompileResult
            {
                Success = true,
                SubPrograms = subPrograms,
                SubProgramCount = CountRecursive(subPrograms),
            };
        }
        catch (Exception ex)
        {
            return new CompileResult { Success = false, ErrorMessage = ex.Message };
        }
    }

    private static JArray CompileDirectory(string subProgramsRoot, StepRunnerCatalog? catalog)
    {
        var result = new JArray();
        foreach (var dir in Directory.EnumerateDirectories(subProgramsRoot).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            var compiled = CompileOne(dir, catalog);
            if (compiled is not null)
            {
                result.Add(compiled);
            }
        }

        return result;
    }

    private static JObject? CompileOne(string subProgramDir, StepRunnerCatalog? catalog)
    {
        var infoPath = QuickerProjectLayout.GetInfoPath(subProgramDir);
        if (!File.Exists(infoPath))
        {
            throw new InvalidOperationException($"Missing info.json under {subProgramDir}.");
        }

        var info = ActionEmbeddedSubProgramProjectFiles.ReadInfo(subProgramDir);
        var subProgram = new JObject
        {
            ["id"] = info.Id ?? string.Empty,
            ["name"] = info.Name ?? string.Empty,
            ["description"] = info.Description ?? string.Empty,
            ["icon"] = info.Icon ?? string.Empty,
        };

        CopyOptional(info.SummaryExpression, "summaryExpression", subProgram);
        CopyOptionalBool(info.IsLocalEdited, "isLocalEdited", subProgram);
        CopyOptionalBool(info.IsProtected, "isProtected", subProgram);
        CopyOptional(info.TemplateId, "templateId", subProgram);
        CopyOptionalInt(info.TemplateRevision, "templateRevision", subProgram);
        CopyOptionalBool(info.UseServerVersion, "useServerVersion", subProgram);
        CopyOptional(info.SharedId, "sharedId", subProgram);
        CopyOptional(info.CreateTimeUtc, "createTimeUtc", subProgram);
        CopyOptional(info.LastEditTimeUtc, "lastEditTimeUtc", subProgram);
        CopyOptional(info.ShareTimeUtc, "shareTimeUtc", subProgram);

        var dataPath = QuickerProjectLayout.GetDataPath(subProgramDir);
        if (File.Exists(dataPath))
        {
            var data = QuickerProjectFiles.ReadData(subProgramDir);
            var compileResult = XActionFileRefCompiler.Compile(data, subProgramDir);
            if (!compileResult.Success || compileResult.CompiledData is null)
            {
                throw new InvalidOperationException(
                    compileResult.ErrorMessage ?? $"Failed to compile subprogram data under {subProgramDir}.");
            }

            subProgram["steps"] = compileResult.CompiledData["steps"] ?? new JArray();
            subProgram["variables"] = compileResult.CompiledData["variables"] ?? new JArray();

            if (catalog is not null)
            {
                var steps = subProgram["steps"] as JArray;
                if (steps is not null)
                {
                    XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);
                }
            }
        }
        else if (!IsReferenceOnly(info))
        {
            subProgram["steps"] = new JArray();
            subProgram["variables"] = new JArray();
        }

        var nestedRoot = QuickerProjectLayout.GetActionEmbeddedSubProgramsRoot(subProgramDir);
        if (Directory.Exists(nestedRoot))
        {
            subProgram["subPrograms"] = CompileDirectory(nestedRoot, catalog);
        }
        else
        {
            subProgram["subPrograms"] = new JArray();
        }

        return subProgram;
    }

    private static bool IsReferenceOnly(ActionEmbeddedSubProgramInfo info)
    {
        var name = (info.Name ?? string.Empty).Trim();
        if (name.StartsWith("%%", StringComparison.Ordinal) || name.StartsWith("@@", StringComparison.Ordinal))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(info.TemplateId) || !string.IsNullOrWhiteSpace(info.SharedId))
        {
            return true;
        }

        return false;
    }

    private static void CopyOptional(string? value, string key, JObject target)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            target[key] = value;
        }
    }

    private static void CopyOptionalBool(bool? value, string key, JObject target)
    {
        if (value.HasValue)
        {
            target[key] = value.Value;
        }
    }

    private static void CopyOptionalInt(int? value, string key, JObject target)
    {
        if (value.HasValue)
        {
            target[key] = value.Value;
        }
    }

    private static int CountRecursive(JArray subPrograms)
    {
        var count = subPrograms.Count;
        foreach (var token in subPrograms)
        {
            if (token is JObject obj && obj["subPrograms"] is JArray nested)
            {
                count += CountRecursive(nested);
            }
        }

        return count;
    }
}
