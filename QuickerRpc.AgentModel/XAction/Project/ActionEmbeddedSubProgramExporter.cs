using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Externalizes action-embedded <c>subPrograms[]</c> into <c>subprograms/{id}/</c> under an action project.
/// </summary>
public static class ActionEmbeddedSubProgramExporter
{
    public sealed class ExportResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public IReadOnlyList<string> WrittenSubProgramDirectories { get; set; } = Array.Empty<string>();

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    public static ExportResult Export(
        JArray? subPrograms,
        string actionProjectDirectory,
        XActionFileRefExportOptions? options = null,
        JObject? templateRootData = null)
    {
        if (subPrograms is null || subPrograms.Count == 0)
        {
            return new ExportResult { Success = true };
        }

        var actionDir = QuickerProjectLayout.ResolveProjectDirectory(actionProjectDirectory);
        var warnings = new List<string>();
        var writtenDirs = new List<string>();

        try
        {
            ExportArray(
                subPrograms,
                actionDir,
                templateRootData?["subPrograms"] as JArray,
                options,
                warnings,
                writtenDirs);
            return new ExportResult
            {
                Success = true,
                WrittenSubProgramDirectories = writtenDirs,
                Warnings = warnings,
            };
        }
        catch (Exception ex)
        {
            return new ExportResult { Success = false, ErrorMessage = ex.Message, Warnings = warnings };
        }
    }

    private static void ExportArray(
        JArray subPrograms,
        string parentProjectDir,
        JArray? templateSubPrograms,
        XActionFileRefExportOptions? options,
        IList<string> warnings,
        IList<string> writtenDirs)
    {
        var subProgramsRoot = QuickerProjectLayout.GetActionEmbeddedSubProgramsRoot(parentProjectDir);
        Directory.CreateDirectory(subProgramsRoot);

        for (var i = 0; i < subPrograms.Count; i++)
        {
            if (subPrograms[i] is not JObject subProgram)
            {
                continue;
            }

            JObject? templateSub = null;
            if (templateSubPrograms is not null && i < templateSubPrograms.Count && templateSubPrograms[i] is JObject t)
            {
                templateSub = t;
            }

            ExportOne(subProgram, parentProjectDir, templateSub, options, warnings, writtenDirs);
        }
    }

    private static void ExportOne(
        JObject subProgram,
        string parentProjectDir,
        JObject? templateSubProgram,
        XActionFileRefExportOptions? options,
        IList<string> warnings,
        IList<string> writtenDirs)
    {
        var key = ResolveDirectoryKey(subProgram);
        var subProgramDir = QuickerProjectLayout.GetActionEmbeddedSubProgramDirectory(parentProjectDir, key);
        Directory.CreateDirectory(subProgramDir);
        writtenDirs.Add(
            QuickerProjectLayout.GetActionEmbeddedSubProgramRelativeDirectory(key));

        var info = InfoFromSubProgram(subProgram);
        ActionEmbeddedSubProgramProjectFiles.WriteInfo(subProgramDir, info);

        if (IsReferenceOnly(subProgram))
        {
            return;
        }

        var steps = subProgram["steps"] as JArray ?? new JArray();
        var variables = subProgram["variables"] as JArray ?? new JArray();
        var body = new JObject
        {
            ["steps"] = steps,
            ["variables"] = variables,
        };

        JObject? templateBody = null;
        if (templateSubProgram is not null)
        {
            templateBody = new JObject
            {
                ["steps"] = templateSubProgram["steps"] as JArray ?? new JArray(),
                ["variables"] = templateSubProgram["variables"] as JArray ?? new JArray(),
            };
        }

        var exportResult = XActionFileRefExporter.Export(
            body,
            subProgramDir,
            templateBody,
            options);
        if (!exportResult.Success || exportResult.ExportedData is null)
        {
            throw new InvalidOperationException(
                exportResult.ErrorMessage ?? $"Failed to export subprogram {key}.");
        }

        if (exportResult.Warnings.Count > 0)
        {
            foreach (var w in exportResult.Warnings)
            {
                warnings.Add($"subprograms/{key}: {w}");
            }
        }

        ActionProjectResourceFile.WriteAll(subProgramDir, exportResult.ResourceFiles);
        ActionProjectFormSpecFileNormalizer.RewriteProjectFormSpecFiles(subProgramDir);
        QuickerProjectFiles.WriteData(subProgramDir, exportResult.ExportedData);

        var nested = subProgram["subPrograms"] as JArray;
        if (nested is not null && nested.Count > 0)
        {
            ExportArray(
                nested,
                subProgramDir,
                templateSubProgram?["subPrograms"] as JArray,
                options,
                warnings,
                writtenDirs);
        }
    }

    private static ActionEmbeddedSubProgramInfo InfoFromSubProgram(JObject subProgram) =>
        new()
        {
            Kind = ActionEmbeddedSubProgramInfo.KindValue,
            Id = ReadString(subProgram, "id", "Id"),
            Name = ReadString(subProgram, "name", "Name"),
            Description = ReadString(subProgram, "description", "Description"),
            Icon = ReadString(subProgram, "icon", "Icon"),
            SummaryExpression = ReadString(subProgram, "summaryExpression", "SummaryExpression"),
            IsLocalEdited = ReadBool(subProgram, "isLocalEdited", "IsLocalEdited"),
            IsProtected = ReadBool(subProgram, "isProtected", "IsProtected"),
            TemplateId = ReadString(subProgram, "templateId", "TemplateId"),
            TemplateRevision = ReadInt(subProgram, "templateRevision", "TemplateRevision"),
            UseServerVersion = ReadBool(subProgram, "useServerVersion", "UseServerVersion"),
            SharedId = ReadString(subProgram, "sharedId", "SharedId"),
            CreateTimeUtc = ReadString(subProgram, "createTimeUtc", "CreateTimeUtc"),
            LastEditTimeUtc = ReadString(subProgram, "lastEditTimeUtc", "LastEditTimeUtc"),
            ShareTimeUtc = ReadString(subProgram, "shareTimeUtc", "ShareTimeUtc"),
        };

    private static string ResolveDirectoryKey(JObject subProgram)
    {
        var id = ReadString(subProgram, "id", "Id");
        if (!string.IsNullOrWhiteSpace(id))
        {
            return QuickerProjectLayout.SanitizeDirectoryName(id);
        }

        var name = ReadString(subProgram, "name", "Name");
        if (!string.IsNullOrWhiteSpace(name))
        {
            return QuickerProjectLayout.SanitizeDirectoryName(name);
        }

        return "unnamed";
    }

    private static bool IsReferenceOnly(JObject subProgram)
    {
        var name = ReadString(subProgram, "name", "Name") ?? string.Empty;
        if (name.StartsWith("%%", StringComparison.Ordinal) || name.StartsWith("@@", StringComparison.Ordinal))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(ReadString(subProgram, "templateId", "TemplateId"))
            || !string.IsNullOrWhiteSpace(ReadString(subProgram, "sharedId", "SharedId")))
        {
            return true;
        }

        var steps = subProgram["steps"] as JArray ?? subProgram["Steps"] as JArray;
        var variables = subProgram["variables"] as JArray ?? subProgram["Variables"] as JArray;
        var nested = subProgram["subPrograms"] as JArray ?? subProgram["SubPrograms"] as JArray;
        var hasSteps = steps?.Count > 0;
        var hasVariables = variables?.Count > 0;
        var hasNested = nested?.Count > 0;
        return !hasSteps && !hasVariables && !hasNested;
    }

    private static string? ReadString(JObject obj, string camel, string pascal)
    {
        var value = obj[camel]?.Type == JTokenType.String
            ? obj.Value<string>(camel)
            : obj.Value<string>(pascal);
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static bool? ReadBool(JObject obj, string camel, string pascal)
    {
        var token = obj[camel] ?? obj[pascal];
        return token?.Type == JTokenType.Boolean ? token.Value<bool>() : null;
    }

    private static int? ReadInt(JObject obj, string camel, string pascal)
    {
        var token = obj[camel] ?? obj[pascal];
        return token?.Type == JTokenType.Integer ? token.Value<int>() : null;
    }
}
