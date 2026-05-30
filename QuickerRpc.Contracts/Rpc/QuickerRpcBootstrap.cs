namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// Quicker action used to bootstrap the QuickerRpc plugin via quicker:runaction URI.
/// </summary>
public static class QuickerRpcBootstrap
{
    /// <summary>Local Quicker action id that loads and starts QuickerRpc plugin.</summary>
    public const string PluginRunActionId = "aa5917ad-1256-4c73-7022-08debe3efcbe";

    public static string BuildRunActionUri()
    {
        return $"quicker:runaction:{PluginRunActionId}";
    }
}
