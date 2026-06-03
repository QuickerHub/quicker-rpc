using System;
using System.IO;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Locate action projects by <c>info.json</c> id under <c>.quicker/actions/</c>.</summary>
public static class ActionProjectCatalog
{
    public static string? FindActionProjectDirectoryByActionId(
        string actionId,
        string? workspaceRoot = null)
    {
        var needle = (actionId ?? string.Empty).Trim();
        if (needle.Length == 0)
        {
            return null;
        }

        var actionsRoot = QuickerProjectLayout.GetKindRoot(QuickerProjectKind.Action, workspaceRoot);
        if (!Directory.Exists(actionsRoot))
        {
            return null;
        }

        foreach (var dir in Directory.EnumerateDirectories(actionsRoot))
        {
            if (!TryReadActionId(dir, out var existingId))
            {
                continue;
            }

            if (string.Equals(existingId, needle, StringComparison.OrdinalIgnoreCase))
            {
                return dir;
            }
        }

        return null;
    }

    public static string GetRelativeProjectDirectory(string projectDirectory, string? workspaceRoot = null)
    {
        var root = Path.GetFullPath(workspaceRoot ?? Directory.GetCurrentDirectory());
        var full = Path.GetFullPath(projectDirectory);
        var rootPrefix = root.EndsWith(Path.DirectorySeparatorChar.ToString())
            ? root
            : root + Path.DirectorySeparatorChar;

        if (full.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return full.Substring(rootPrefix.Length).Replace('\\', '/');
        }

        return full.Replace('\\', '/');
    }

    public static string ResolveExtractProjectDirectory(
        string actionId,
        string? title,
        string? explicitDir,
        string? workspaceRoot = null)
    {
        if (!string.IsNullOrWhiteSpace(explicitDir))
        {
            return QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
        }

        var existing = FindActionProjectDirectoryByActionId(actionId, workspaceRoot);
        if (existing != null)
        {
            return existing;
        }

        return AllocateNewProjectDirectory(actionId, title, workspaceRoot);
    }

    public static string ResolveImportProjectDirectory(
        string? explicitActionId,
        string? explicitDir,
        string? workspaceRoot = null)
    {
        if (!string.IsNullOrWhiteSpace(explicitDir))
        {
            return QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
        }

        var id = (explicitActionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            throw new ArgumentException("Provide --dir <projectDirectory> or --id <actionId>.");
        }

        var found = FindActionProjectDirectoryByActionId(id, workspaceRoot);
        if (found != null)
        {
            return found;
        }

        throw new ArgumentException(
            $"No .quicker/actions project found for action {id}. Run action extract or pass --dir.");
    }

    public static string AllocateNewProjectDirectory(
        string actionId,
        string? title,
        string? workspaceRoot = null)
    {
        var actionsRoot = QuickerProjectLayout.GetKindRoot(QuickerProjectKind.Action, workspaceRoot);
        Directory.CreateDirectory(actionsRoot);

        var dirName = ActionProjectDirectoryNaming.DirectoryNameFromActionId(actionId);
        var projectDir = Path.Combine(actionsRoot, dirName);
        if (Directory.Exists(projectDir)
            && TryReadActionId(projectDir, out var existingId)
            && !string.Equals(existingId, actionId, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Project directory {dirName} exists for a different action ({existingId}).");
        }

        return projectDir;
    }

    private static bool TryReadActionId(string projectDir, out string? actionId)
    {
        actionId = null;
        try
        {
            var infoPath = QuickerProjectLayout.GetInfoPath(projectDir);
            if (!File.Exists(infoPath))
            {
                return false;
            }

            var info = QuickerProjectFiles.ReadActionInfo(projectDir);
            actionId = info.Id?.Trim();
            return !string.IsNullOrWhiteSpace(actionId);
        }
        catch
        {
            return false;
        }
    }
}
