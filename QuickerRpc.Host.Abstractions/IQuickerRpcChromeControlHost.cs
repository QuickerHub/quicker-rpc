using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Browser connector and sys:chromecontrol operations (optional port).</summary>
public interface IQuickerRpcChromeControlHost
{
    Task<QuickerRpcChromeControlResult> ExecuteAsync(
        string operation,
        string? parametersJson = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcChromeControlTabsResult> ListTabsAsync(
        CancellationToken cancellationToken = default);
}
