using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Runtime;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ResourceCatalogPageHost : IQuickerRpcResourceCatalogPageHost
{
    private readonly V1ResourceCatalogCapture _capture;
    private readonly QuickerRpcHostSessionScope _hostSession;
    public V1ResourceCatalogPageHost(V1ResourceCatalogCapture capture, QuickerRpcHostSessionScope hostSession)
    { _capture = capture; _hostSession = hostSession; }
    public bool CanRead(string kind) => _capture.CanRead(kind);

    public async Task<QuickerRpcResourceCatalogPageResult> GetResourceCatalogPageAsync(string kind,
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request is null) return Failure(kind, "INVALID_RESOURCE_CATALOG_REQUEST", "A resource page request is required.");
        var query = new ResourceCatalogPageQuery(request.Scope, request.Query, request.Skip, request.Take, request.ExpectedSnapshotId);
        if (!ResourceCatalogPage.TryNormalizeQuery(kind, query, out var normalized, out var code, out var error))
            return Failure(kind, code!, error!);
        if (!CanRead(kind)) return Failure(kind, "UNSUPPORTED_HOST", "The selected host does not provide this resource catalog.");
        var captured = await _capture.CaptureAsync(kind, cancellationToken).ConfigureAwait(false);
        if (!captured.Success) return Failure(kind, captured.ErrorCode!, captured.ErrorMessage!);
        cancellationToken.ThrowIfCancellationRequested();
        var identity = new ResourceCatalogCaptureIdentity(_hostSession.InstanceId, _hostSession.Id,
            captured.OwnerId, captured.AccountScope, captured.Revision);
        // Hashing, filtering and sorting do not hold a native monitor or access native entities.
        var page = ResourceCatalogPage.Build(kind, identity, captured.Entries, normalized, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        if (!_capture.IsCurrent(captured)) return Failure(kind, "CATALOG_CHANGED", "The capture owner or native synchronization revision changed. Read a new first page.");
        return new QuickerRpcResourceCatalogPageResult
        {
            Success = page.Success, ErrorCode = page.ErrorCode, ErrorMessage = page.ErrorMessage,
            Kind = page.Kind, Scope = page.Scope, Query = page.Query, Skip = page.Skip, Take = page.Take,
            TotalCount = page.TotalCount, HasMore = page.HasMore, SnapshotId = page.SnapshotId,
            Items = page.Items.Select(item => new QuickerRpcResourceCatalogItem
            {
                Id = item.Id, Title = item.Title, Description = item.Description, Icon = item.Icon,
                EditVersion = item.EditVersion, ActionType = item.ActionType, CallIdentifier = item.CallIdentifier,
            }).ToList(),
        };
    }

    private static QuickerRpcResourceCatalogPageResult Failure(string kind, string code, string error) =>
        new() { Success = false, Kind = kind, ErrorCode = code, ErrorMessage = error };
}
