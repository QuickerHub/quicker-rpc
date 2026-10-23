using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Serve;

internal static class ServeHealthQuery
{
    public static async Task<ServeHealthResponse> ReadAsync(IQuickerRpcService rpc, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var pong = await rpc.PingAsync(cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        var version = await rpc.GetProtocolVersionAsync(cancellationToken).ConfigureAwait(false);
        var hostSession = await QuickerRpcHostSessionClient.TryGetAsync(rpc, cancellationToken).ConfigureAwait(false);
        return new ServeHealthResponse
        {
            Ok = true, Pong = pong, ProtocolVersion = version,
            Pipe = QuickerRpcClient.GetBinding(rpc)?.Endpoint ?? QuickerRpcPipeNames.ServerPipe, HostSession = hostSession,
            HostBinding = QuickerRpcClient.GetBinding(rpc),
        };
    }
}
