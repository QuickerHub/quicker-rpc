using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Optional complete runtime catalog paging, independent of search and Designer UI services.</summary>
public interface IQuickerRpcResourceCatalogPageHost
{
    bool CanRead(string kind);
    Task<QuickerRpcResourceCatalogPageResult> GetResourceCatalogPageAsync(string kind,
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default);
}
