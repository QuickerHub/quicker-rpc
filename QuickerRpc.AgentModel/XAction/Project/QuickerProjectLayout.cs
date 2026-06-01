using System;
using System.IO;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Paths for the normalized <c>.quicker</c> authoring layout.</summary>
public static class QuickerProjectLayout
{
    public const string QuickerRootDirName = ".quicker";
    public const string ActionsDirName = "actions";
    public const string SubProgramsDirName = "subprograms";
    public const string InfoFileName = "info.json";
    public const string DataFileName = "data.json";

    public static string GetQuickerRoot(string? workspaceRoot = null) =>
        Path.Combine(workspaceRoot ?? Directory.GetCurrentDirectory(), QuickerRootDirName);

    public static string GetKindRoot(QuickerProjectKind kind, string? workspaceRoot = null) =>
        Path.Combine(
            GetQuickerRoot(workspaceRoot),
            kind == QuickerProjectKind.Action ? ActionsDirName : SubProgramsDirName);

    public static string GetProjectDirectory(QuickerProjectKind kind, string name, string? workspaceRoot = null) =>
        Path.Combine(GetKindRoot(kind, workspaceRoot), SanitizeDirectoryName(name));

    public static string GetInfoPath(string projectDirectory) =>
        Path.Combine(projectDirectory, InfoFileName);

    public static string GetDataPath(string projectDirectory) =>
        Path.Combine(projectDirectory, DataFileName);

    /// <summary>Resolves <paramref name="dir"/> to an absolute project directory.</summary>
    public static string ResolveProjectDirectory(string dir)
    {
        var trimmed = (dir ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Project directory is required.", nameof(dir));
        }

        return Path.GetFullPath(trimmed);
    }

    public static string SanitizeDirectoryName(string name)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            throw new ArgumentException("Project name is required.", nameof(name));
        }

        foreach (var c in Path.GetInvalidFileNameChars())
        {
            trimmed = trimmed.Replace(c, '_');
        }

        return trimmed.TrimEnd('.');
    }
}
