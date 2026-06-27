using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1LauncherHost : IQuickerRpcLauncherHost
{
    private readonly LauncherResolveService _launcher;

    public V1LauncherHost(LauncherResolveService launcher) => _launcher = launcher;

    public Task<QuickerRpcResolveLauncherIntentResult> ResolveIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_launcher.Resolve(query, maxResults, scopes));
    }
}
