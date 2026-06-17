using System;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Private designer-tool owner id (same identity source as <c>qkrpc quicker.account.get</c> / <see cref="QuickerAccountAccessor"/>).
/// Private ActionDesigner tools-tab owner (AI chat tab is public to all logged-in users).
/// </summary>
internal static class ActionDesignerToolOwner
{
    /// <summary>Quicker user id allowed to receive the private ActionDesigner tools tab.</summary>
    private const string PrivateOwnerUserId = "a3f5a32b2e62b523f575b3a998da8b7a";

    /// <summary>Optional local override for development (never set in production builds).</summary>
    private const string OwnerUserIdEnvVar = "QKRPC_DESIGNER_TOOL_USER_ID";

    /// <summary>
    /// Resolves the allowed owner user id. Returns null when the feature is not configured for the current account.
    /// </summary>
    public static string? ResolveOwnerUserId(string currentUserId, out string? infoMessage)
    {
        infoMessage = null;
        var envUserId = Environment.GetEnvironmentVariable(OwnerUserIdEnvVar)?.Trim();
        if (!string.IsNullOrEmpty(envUserId))
        {
            return envUserId;
        }

        return string.IsNullOrWhiteSpace(PrivateOwnerUserId) ? null : PrivateOwnerUserId.Trim();
    }
}
