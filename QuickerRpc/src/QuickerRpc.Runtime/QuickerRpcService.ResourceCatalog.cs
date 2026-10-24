using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    public Task<QuickerRpcResourceCatalogPageResult> GetActionResourceCatalogPageAsync(
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default) =>
        GetResourceCatalogPageAsync(QuickerRpcResourceCatalogKinds.Action, request, cancellationToken);

    public Task<QuickerRpcResourceCatalogPageResult> GetGlobalSubProgramResourceCatalogPageAsync(
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default) =>
        GetResourceCatalogPageAsync(QuickerRpcResourceCatalogKinds.GlobalSubProgram, request, cancellationToken);

    private async Task<QuickerRpcResourceCatalogPageResult> GetResourceCatalogPageAsync(string kind,
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request is null) return ResourceCatalogFailure(kind, "INVALID_RESOURCE_CATALOG_REQUEST", "A resource page request is required.");
        var input = new ResourceCatalogPageQuery(request.Scope, request.Query, request.Skip, request.Take, request.ExpectedSnapshotId);
        if (!ResourceCatalogPage.TryNormalizeQuery(kind, input, out var normalized, out var code, out var error))
            return ResourceCatalogFailure(kind, code!, error!);
        cancellationToken.ThrowIfCancellationRequested();
        var port = _host as IQuickerRpcResourceCatalogPageHost;
        if (port is null || !port.CanRead(kind))
            return ResourceCatalogFailure(kind, "UNSUPPORTED_HOST", "The selected host does not provide this runtime resource catalog.");
        cancellationToken.ThrowIfCancellationRequested();
        var result = await port.GetResourceCatalogPageAsync(kind, new QuickerRpcResourceCatalogPageRequest
        {
            Scope = normalized.Scope, Query = normalized.Query, Skip = normalized.Skip, Take = normalized.Take,
            ExpectedSnapshotId = normalized.ExpectedSnapshotId,
        }, cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        return result;
    }

    private static QuickerRpcResourceCatalogPageResult ResourceCatalogFailure(string kind, string code, string message) =>
        new() { Success = false, Kind = kind, ErrorCode = code, ErrorMessage = message };
}
