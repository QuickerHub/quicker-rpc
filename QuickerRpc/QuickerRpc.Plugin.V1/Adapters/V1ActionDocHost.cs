using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ActionDocHost : IQuickerRpcActionDocHost
{
    private readonly ActionDocService _docs;

    public V1ActionDocHost(ActionDocService docs) => _docs = docs;

    public Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _docs.GetDetailHtmlAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default) =>
        _docs.SetDetailHtmlAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<QuickerRpcActionDocResult> SubmitForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        _docs.SubmitForReviewAsync(idOrSharedId, htmlContent, cancellationToken);

    public Task<string> ProbeDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _docs.ProbeApisAsync(idOrSharedId, cancellationToken);

    public Task<QuickerRpcSharedInfoWebSessionResult> PrepareWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        _docs.PrepareWebSessionAsync(idOrSharedId, cancellationToken);
}
