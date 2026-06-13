using System;
using System.IO;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Private designer-tool owner id (same identity source as <c>qkrpc quicker.account.get</c> / <see cref="QuickerAccountAccessor"/>).
/// </summary>
internal static class ActionDesignerToolOwner
{
    private const string OwnerUserIdEnvVar = "QKRPC_DESIGNER_TOOL_USER_ID";

    private static string OwnerFilePath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            "qkrpc",
            "designer-tool-owner.txt");

    /// <summary>
    /// Resolves the allowed owner user id. On first run, binds to <paramref name="currentUserId"/> on this machine.
    /// </summary>
    public static string? ResolveOwnerUserId(string currentUserId, out string? infoMessage)
    {
        infoMessage = null;
        var envUserId = Environment.GetEnvironmentVariable(OwnerUserIdEnvVar)?.Trim();
        if (!string.IsNullOrEmpty(envUserId))
        {
            return envUserId;
        }

        if (File.Exists(OwnerFilePath))
        {
            var fromFile = File.ReadAllText(OwnerFilePath).Trim();
            if (!string.IsNullOrEmpty(fromFile))
            {
                return fromFile;
            }
        }

        if (string.IsNullOrWhiteSpace(currentUserId))
        {
            return null;
        }

        var ownerId = currentUserId.Trim();
        var directory = Path.GetDirectoryName(OwnerFilePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(OwnerFilePath, ownerId);
        infoMessage = $"Designer tool owner bound to Quicker user {ownerId}.";
        return ownerId;
    }
}
