using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ActionProgramHost : IQuickerRpcActionProgramHost
{
    private readonly HeadlessActionProgramService _programs;

    public V1ActionProgramHost(HeadlessActionProgramService programs)
    {
        _programs = programs;
    }

    public Task<QuickerRpcActionProgramSnapshot?> TryGetProgramAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.TryLoadProgramSnapshot(actionId));
    }

    public Task<QuickerRpcActionProgramWriteResult> TryWriteProgramBodyAsync(
        QuickerRpcActionProgramBodyWrite write,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var apply = _programs.ApplyXActionToAction(
            write.ActionId,
            write.BodyJson,
            write.Options.ExpectedEditVersion,
            write.Options.Force);

        if (apply.Success)
        {
            return Task.FromResult(QuickerRpcActionProgramWriteResult.Ok(write.ActionId, apply.EditVersion ?? 0));
        }

        if (apply.VersionConflict == true)
        {
            return Task.FromResult(QuickerRpcActionProgramWriteResult.Conflict(
                write.ActionId,
                apply.EditVersion ?? 0,
                apply.ErrorMessage ?? "Version conflict."));
        }

        return Task.FromResult(QuickerRpcActionProgramWriteResult.Fail(
            write.ActionId,
            apply.ErrorMessage ?? "Write failed."));
    }

    public Task<QuickerRpcApplyActionPatchResult> TryApplyPatchAsync(
        string actionId,
        string patchJson,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.ApplyActionPatchToAction(
            actionId,
            patchJson,
            expectedEditVersion,
            force));
    }

    public Task<QuickerRpcActionProgramWriteResult> TryUpdatePresentationAsync(
        QuickerRpcActionPresentationWrite write,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = _programs.UpdateActionMetadata(
            write.ActionId,
            write.Title,
            write.Description,
            write.Icon,
            write.ContextMenuData,
            write.Options.ExpectedEditVersion,
            write.Options.Force);

        if (result.Success)
        {
            return Task.FromResult(QuickerRpcActionProgramWriteResult.Ok(write.ActionId, result.EditVersion ?? 0));
        }

        if (result.VersionConflict == true)
        {
            return Task.FromResult(QuickerRpcActionProgramWriteResult.Conflict(
                write.ActionId,
                result.EditVersion ?? 0,
                result.ErrorMessage ?? "Version conflict."));
        }

        return Task.FromResult(QuickerRpcActionProgramWriteResult.Fail(
            write.ActionId,
            result.ErrorMessage ?? "Update failed."));
    }
}
