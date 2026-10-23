using System;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

/// <summary>Compatibility query: old plugins have no identity, never an inferred V1 identity.</summary>
public static class QuickerRpcHostSessionClient
{
    public static async Task<QuickerRpcHostSessionInfo?> TryGetAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken = default)
    {
        if (rpc is null) throw new ArgumentNullException(nameof(rpc));
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            var session = await rpc.GetHostSessionAsync(cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            return session;
        }
        catch (RemoteMethodNotFoundException)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return null;
        }
    }
}
