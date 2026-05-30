using System;
using System.IO;
using StreamJsonRpc;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// Minimal StreamJsonRpc client setup over one duplex stream.
/// </summary>
public static class StreamJsonRpcSession
{
    public static (JsonRpc Rpc, T Proxy) CreateClient<T>(
        Stream duplex,
        EventHandler<JsonRpcDisconnectedEventArgs>? disconnected = null)
        where T : class
    {
        var rpc = StreamJsonRpcFactory.CreateDuplexJsonRpc(duplex);
        if (disconnected is not null)
        {
            rpc.Disconnected += disconnected;
        }

        var proxy = rpc.Attach<T>();
        rpc.StartListening();
        return (rpc, proxy);
    }
}
