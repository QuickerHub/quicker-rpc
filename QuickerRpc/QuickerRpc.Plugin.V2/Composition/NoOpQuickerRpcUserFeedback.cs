using QuickerRpc.Host;

namespace QuickerRpc.Plugin.V2.Composition;

/// <summary>V2 headless RPC path; user feedback is owned by Quicker shell, not the plugin.</summary>
internal sealed class NoOpQuickerRpcUserFeedback : IQuickerRpcUserFeedback
{
    public void Success(string message) { }

    public void Error(string message) { }
}
