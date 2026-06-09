using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Core;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Repairs workspace <c>data.json</c> that still has inline native <c>formDef.value</c>
/// by exporting <c>formDef.file</c> + <c>qkrpc.form.v1</c> sidecar files.
/// </summary>
public static class ActionProjectFormDefNormalizer
{
    public sealed class NormalizeResult
    {
        public bool Changed { get; set; }

        public int ResourceFilesWritten { get; set; }

        public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
    }

    public static NormalizeResult TryApplyToProject(string projectDirectory)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        if (!File.Exists(QuickerProjectLayout.GetDataPath(projectDir)))
        {
            return new NormalizeResult();
        }

        var data = QuickerProjectFiles.ReadData(projectDir);
        var before = JTokenCompat.Compact(data);
        var resourceFiles = new List<ActionProjectResourceFile>();
        var warnings = new List<string>();
        XActionFormDefReversibleExporter.Apply(data, templateData: data, resourceFiles, warnings, projectDir);
        var auto = XActionFileRefAutoExternalizer.Apply(
            data,
            projectDir,
            XActionFileRefExportOptions.DefaultAutoExternalizeMinLines);
        resourceFiles.AddRange(auto.ResourceFiles);
        warnings.AddRange(auto.Warnings);
        var after = JTokenCompat.Compact(data);
        var dataChanged = !string.Equals(before, after, StringComparison.Ordinal);

        if (resourceFiles.Count > 0)
        {
            ActionProjectResourceFile.WriteAll(projectDir, resourceFiles);
        }

        if (dataChanged)
        {
            QuickerProjectFiles.WriteData(projectDir, data);
        }

        var formFilesRewritten = ActionProjectFormSpecFileNormalizer.RewriteProjectFormSpecFiles(projectDir);
        if (!dataChanged && resourceFiles.Count == 0 && formFilesRewritten == 0)
        {
            return new NormalizeResult { Warnings = warnings };
        }

        return new NormalizeResult
        {
            Changed = true,
            ResourceFilesWritten = resourceFiles.Count + formFilesRewritten,
            Warnings = warnings,
        };
    }
}
