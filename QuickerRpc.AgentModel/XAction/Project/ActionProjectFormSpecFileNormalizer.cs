using System;
using System.IO;
using System.Text;
using QuickerRpc.AgentModel.Form;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Rewrites on-disk <c>*.form.json</c> using <see cref="FormSpecDecompiler"/> UTF-8 CJK output.</summary>
public static class ActionProjectFormSpecFileNormalizer
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public static int RewriteProjectFormSpecFiles(string projectDirectory)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var filesDir = Path.Combine(projectDir, XActionFileRefAutoExternalizer.DefaultFilesSubdir);
        if (!Directory.Exists(filesDir))
        {
            return 0;
        }

        var rewritten = 0;
        foreach (var path in Directory.EnumerateFiles(filesDir, "*.form.json", SearchOption.AllDirectories))
        {
            var raw = File.ReadAllText(path, Utf8NoBom);
            var normalized = FormSpecDecompiler.NormalizeFormSpecFileContent(raw);
            if (string.Equals(raw, normalized, StringComparison.Ordinal))
            {
                continue;
            }

            File.WriteAllText(path, normalized, Utf8NoBom);
            rewritten++;
        }

        return rewritten;
    }
}
