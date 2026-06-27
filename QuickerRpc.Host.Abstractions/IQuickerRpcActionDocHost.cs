using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>getquicker.net shared-action HTML intro and related web session helpers.</summary>
public interface IQuickerRpcActionDocHost
{
    Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionDocResult> SubmitForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default);

    Task<string> ProbeDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSharedInfoWebSessionResult> PrepareWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default);
}
