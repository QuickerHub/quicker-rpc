using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Share, publish, and read shared actions on getquicker.net.</summary>
public interface IQuickerRpcActionSharingHost
{
    Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default);
}
