using System;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// Quicker action used to bootstrap the QuickerRpc plugin via quicker:runaction URI.
/// </summary>
public static class QuickerRpcBootstrap
{
    /// <summary>Local Quicker action id that loads and starts QuickerRpc plugin.</summary>
    public const string PluginRunActionId = "aa5917ad-1256-4c73-7022-08debe3efcbe";

    /// <param name="startMode">
    /// Passed as action <c>quicker_in_param</c> (e.g. <see cref="LauncherStartModePluginOnly"/> for qkrpc bootstrap).
    /// </param>
    public static string BuildRunActionUri(string? startMode = LauncherStartModePluginOnly)
    {
        var id = PluginRunActionId;
        if (string.IsNullOrWhiteSpace(startMode))
        {
            return $"quicker:runaction:{id}";
        }

        return $"quicker:runaction:{id}?{Uri.EscapeDataString(startMode.Trim())}";
    }

    /// <summary>Silent RPC-only bootstrap (no QuickerAgent, no popups).</summary>
    public const string LauncherStartModePluginOnly = "plugin";
}
