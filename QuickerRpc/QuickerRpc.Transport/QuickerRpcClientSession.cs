using System;
using System.IO.Pipes;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

/// <summary>Connected StreamJsonRpc client session to <see cref="IQuickerRpcService"/>.</summary>
public sealed class QuickerRpcClientSession : IAsyncDisposable
{
    internal QuickerRpcClientSession(NamedPipeClientStream pipe, JsonRpc jsonRpc, IQuickerRpcService rpc)
    {
        Pipe = pipe;
        JsonRpc = jsonRpc;
        Rpc = rpc;
    }

    public NamedPipeClientStream Pipe { get; }

    public JsonRpc JsonRpc { get; }

    public IQuickerRpcService Rpc { get; }

    public ValueTask DisposeAsync()
    {
        JsonRpc.Dispose();
        Pipe.Dispose();
        return default;
    }
}
