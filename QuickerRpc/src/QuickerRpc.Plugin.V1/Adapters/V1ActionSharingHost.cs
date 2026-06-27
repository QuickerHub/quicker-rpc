using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ActionSharingHost : IQuickerRpcActionSharingHost
{
    private readonly ActionPublishService _publish;
    private readonly HeadlessActionProgramService _programs;

    public V1ActionSharingHost(ActionPublishService publish, HeadlessActionProgramService programs)
    {
        _publish = publish;
        _programs = programs;
    }

    public async Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default)
    {
        var publish = await _publish.PublishSharedActionAsync(
            actionId,
            new QuickerRpcActionPublishRequest { ChangeLog = changeLog },
            cancellationToken).ConfigureAwait(false);

        return new QuickerRpcActionUpdateResult
        {
            Ok = publish.Ok,
            ActionId = publish.SharedActionId ?? publish.ActionId ?? actionId,
            Message = publish.Message,
        };
    }

    public Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        _publish.PublishSharedActionAsync(actionId, request, cancellationToken);

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        _publish.PreflightPublishSharedActionAsync(actionId, request, cancellationToken);

    public Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.GetCompressedSharedAction(sharedActionId, returnMode));
    }
}
