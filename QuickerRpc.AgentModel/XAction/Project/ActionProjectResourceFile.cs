using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Deferred disk payload for action project extract (written before <c>data.json</c>).</summary>
public sealed class ActionProjectResourceFile
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public string RelativePath { get; set; } = "";

    public string Content { get; set; } = "";

    public static void WriteAll(string projectDirectory, IEnumerable<ActionProjectResourceFile> files)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        foreach (var file in files.OrderBy(f => f.RelativePath, StringComparer.OrdinalIgnoreCase))
        {
            var relative = XActionFileRefPath.NormalizeRelativePath(file.RelativePath);
            var fullPath = XActionFileRefPath.ResolveFullPath(projectDir, relative);
            var dir = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(fullPath, file.Content, Utf8NoBom);
        }
    }
}
