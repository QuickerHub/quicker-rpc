using System;
using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Per JSON-RPC session trace fan-out (AsyncLocal). Set by plugin server on connect.</summary>
public static class QuickerRpcTraceSink
{
    private static readonly AsyncLocal<IQuickerRpcClientCallbacks?> ClientCallbacks = new();

    public static IQuickerRpcClientCallbacks? CurrentClientCallbacks => ClientCallbacks.Value;

    public static IDisposable BeginSession(IQuickerRpcClientCallbacks? callbacks) =>
        new SessionScope(callbacks);

    public static void Publish(QuickerRpcActionTraceEvent traceEvent)
    {
        var callbacks = ClientCallbacks.Value;
        if (callbacks is null)
        {
            return;
        }

        _ = PublishAsync(callbacks, traceEvent);
    }

    private static async Task PublishAsync(IQuickerRpcClientCallbacks callbacks, QuickerRpcActionTraceEvent traceEvent)
    {
        try
        {
            await callbacks.ActionTraceEventAsync(traceEvent).ConfigureAwait(false);
        }
        catch
        {
            // Best-effort streaming; RPC result still carries full trace.
        }
    }

    private sealed class SessionScope : IDisposable
    {
        private readonly IQuickerRpcClientCallbacks? _previous;

        public SessionScope(IQuickerRpcClientCallbacks? callbacks)
        {
            _previous = ClientCallbacks.Value;
            ClientCallbacks.Value = callbacks;
        }

        public void Dispose() => ClientCallbacks.Value = _previous;
    }
}
