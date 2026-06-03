using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>
/// Writes an extracted action project in a stable order:
/// directory → info.json → files/* → data.json (last).
/// </summary>
public static class ActionProjectExtractWriter
{
    public static IReadOnlyList<string> Write(
        string projectDirectory,
        ActionProjectInfo info,
        JObject exportedData,
        IEnumerable<ActionProjectResourceFile> resourceFiles)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        Directory.CreateDirectory(projectDir);
        QuickerProjectFiles.WriteActionInfo(projectDir, info);
        ActionProjectResourceFile.WriteAll(projectDir, resourceFiles);
        ActionProjectFormSpecFileNormalizer.RewriteProjectFormSpecFiles(projectDir);
        QuickerProjectFiles.WriteData(projectDir, exportedData);
        return CollectWrittenPaths(resourceFiles);
    }

    private static IReadOnlyList<string> CollectWrittenPaths(
        IEnumerable<ActionProjectResourceFile> resourceFiles)
    {
        var paths = new List<string>();
        foreach (var file in resourceFiles)
        {
            if (!string.IsNullOrWhiteSpace(file.RelativePath))
            {
                paths.Add(XActionFileRefPath.NormalizeRelativePath(file.RelativePath));
            }
        }

        return paths;
    }
}
