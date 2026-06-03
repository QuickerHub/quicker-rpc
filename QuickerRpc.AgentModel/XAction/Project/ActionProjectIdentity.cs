using System;
using System.IO;

namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Resolve Quicker action id from info.json and/or project directory name.</summary>
public static class ActionProjectIdentity
{
    public static bool LooksLikeActionId(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();
        return trimmed.Length > 0 && Guid.TryParse(trimmed, out _);
    }

    public static string? FromInfoOrDirectory(ActionProjectInfo info, string projectDirectory)
    {
        var fromInfo = info.Id?.Trim();
        if (LooksLikeActionId(fromInfo))
        {
            return fromInfo;
        }

        var dirName = Path.GetFileName(
            projectDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        return LooksLikeActionId(dirName) ? dirName : null;
    }

    public static string DirectoryNameFromPath(string projectDirectory)
    {
        return Path.GetFileName(
            projectDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
    }
}
