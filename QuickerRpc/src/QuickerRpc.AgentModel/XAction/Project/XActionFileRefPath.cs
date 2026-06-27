using System;
using System.IO;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Resolves and validates relative file paths inside a project directory.</summary>
public static class XActionFileRefPath
{
    public static string NormalizeRelativePath(string relativePath)
    {
        var trimmed = (relativePath ?? string.Empty).Trim().Replace('\\', '/');
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("file path is empty.", nameof(relativePath));
        }

        if (Path.IsPathRooted(trimmed))
        {
            throw new ArgumentException("file path must be relative to the project directory.", nameof(relativePath));
        }

        var segments = trimmed.Split(new char[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0)
        {
            throw new ArgumentException("file path is empty.", nameof(relativePath));
        }

        foreach (var segment in segments)
        {
            if (segment == "." || segment == "..")
            {
                throw new ArgumentException("file path must not contain '.' or '..' segments.", nameof(relativePath));
            }
        }

        return string.Join("/", segments);
    }

    public static string ResolveFullPath(string projectDirectory, string relativePath)
    {
        var normalized = NormalizeRelativePath(relativePath);
        var combined = projectDirectory;
        foreach (var segment in normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
        {
            combined = Path.Combine(combined, segment);
        }

        var full = Path.GetFullPath(combined);
        var projectFull = Path.GetFullPath(projectDirectory);
        if (!full.StartsWith(projectFull, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"file path escapes project directory: {relativePath}");
        }

        return full;
    }
}
