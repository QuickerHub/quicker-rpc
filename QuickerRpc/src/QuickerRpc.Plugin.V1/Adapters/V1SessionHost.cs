using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1SessionHost : IQuickerRpcSessionHost
{
    public Task<QuickerRpcAccountInfo> GetAccountAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerAccountAccessor.TryGetAccountInfo());
    }

    public Task<QuickerRpcWebSessionInfo> GetWebSessionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerAccountAccessor.TryGetWebSessionInfo());
    }
}
