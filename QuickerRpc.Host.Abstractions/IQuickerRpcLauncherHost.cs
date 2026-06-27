using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Unified launcher intent resolution (optional port).</summary>
public interface IQuickerRpcLauncherHost
{
    Task<QuickerRpcResolveLauncherIntentResult> ResolveIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default);
}
