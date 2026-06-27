using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Quicker account and getquicker.net web session.</summary>
public interface IQuickerRpcSessionHost
{
    Task<QuickerRpcAccountInfo> GetAccountAsync(CancellationToken cancellationToken = default);

    Task<QuickerRpcWebSessionInfo> GetWebSessionAsync(CancellationToken cancellationToken = default);
}
