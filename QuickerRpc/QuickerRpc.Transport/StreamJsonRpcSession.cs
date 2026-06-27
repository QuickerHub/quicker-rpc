using System;
using System.IO;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

/// <summary>
/// Minimal StreamJsonRpc client setup over one duplex stream.
/// </summary>
public static class StreamJsonRpcSession
{
    public static (JsonRpc Rpc, T Proxy) CreateClient<T>(
        Stream duplex,
        EventHandler<JsonRpcDisconnectedEventArgs>? disconnected = null)
        where T : class =>
        CreateClient<T>(duplex, localRpcTarget: null, disconnected);

    public static (JsonRpc Rpc, T Proxy) CreateClient<T>(
        Stream duplex,
        object? localRpcTarget,
        EventHandler<JsonRpcDisconnectedEventArgs>? disconnected = null)
        where T : class
    {
        var rpc = StreamJsonRpcFactory.CreateDuplexJsonRpc(duplex);
        if (localRpcTarget is IQuickerRpcClientCallbacks traceCallbacks)
        {
            rpc.AddLocalRpcTarget(traceCallbacks);
        }
        else if (localRpcTarget is not null)
        {
            rpc.AddLocalRpcTarget(localRpcTarget);
        }

        if (disconnected is not null)
        {
            rpc.Disconnected += disconnected;
        }

        var proxy = rpc.Attach<T>();
        rpc.StartListening();
        return (rpc, proxy);
    }
}
