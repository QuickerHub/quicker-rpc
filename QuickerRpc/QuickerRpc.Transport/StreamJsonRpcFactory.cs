using System;
using System.IO;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

/// <summary>
/// Shared StreamJsonRpc wiring for QuickerRpc named-pipe sessions.
/// </summary>
public static class StreamJsonRpcFactory
{
    public static JsonRpc CreateDuplexJsonRpc(Stream duplex, object? localRpcTarget = null)
    {
        var rpc = new JsonRpc(duplex, duplex);
        if (localRpcTarget is not null)
        {
            rpc.AddLocalRpcTarget(localRpcTarget);
        }

        return rpc;
    }

    public static JsonRpc CreateDuplexJsonRpc<TContract>(Stream duplex, TContract? localRpcTarget = null)
        where TContract : class
    {
        var rpc = new JsonRpc(duplex, duplex);
        if (localRpcTarget is not null)
        {
            rpc.AddLocalRpcTarget<TContract>(localRpcTarget, null);
        }

        return rpc;
    }

    public static JsonRpc StartListeningServer(
        Stream duplex,
        object localRpcTarget,
        EventHandler<JsonRpcDisconnectedEventArgs>? disconnected = null)
    {
        var rpc = CreateDuplexJsonRpc(duplex, localRpcTarget);
        if (disconnected is not null)
        {
            rpc.Disconnected += disconnected;
        }

        rpc.StartListening();
        return rpc;
    }

    public static JsonRpc StartListeningServer<TContract>(
        Stream duplex,
        TContract localRpcTarget,
        EventHandler<JsonRpcDisconnectedEventArgs>? disconnected = null)
        where TContract : class
    {
        var rpc = CreateDuplexJsonRpc<TContract>(duplex, localRpcTarget);
        if (disconnected is not null)
        {
            rpc.Disconnected += disconnected;
        }

        rpc.StartListening();
        return rpc;
    }
}
