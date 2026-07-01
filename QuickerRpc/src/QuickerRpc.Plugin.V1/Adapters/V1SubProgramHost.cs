using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1SubProgramHost : IQuickerRpcSubProgramHost
{
    private readonly HeadlessSubProgramProgramService _programs;
    private readonly HeadlessVariableEditService _variables;
    private readonly SubProgramPublishService _publish;

    public V1SubProgramHost(
        HeadlessSubProgramProgramService programs,
        HeadlessVariableEditService variables,
        SubProgramPublishService publish)
    {
        _programs = programs;
        _variables = variables;
        _publish = publish;
    }

    public Task<QuickerRpcSubProgramSnapshot?> TryGetAsync(
        string idOrName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.TryLoadSubProgramSnapshot(idOrName));
    }

    public Task<QuickerRpcSubProgramWriteResult> TryWriteBodyAsync(
        QuickerRpcSubProgramBodyWrite write,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var apply = _programs.ApplyProgramToSubProgram(
            write.IdOrName,
            write.BodyJson,
            write.Options.ExpectedEditVersion,
            write.Options.Force);

        if (apply.Success)
        {
            return Task.FromResult(QuickerRpcSubProgramWriteResult.Ok(
                write.IdOrName,
                apply.SubProgramId,
                apply.EditVersion ?? 0));
        }

        if (apply.VersionConflict == true)
        {
            return Task.FromResult(QuickerRpcSubProgramWriteResult.Conflict(
                write.IdOrName,
                apply.EditVersion ?? 0,
                apply.ErrorMessage ?? "Version conflict."));
        }

        return Task.FromResult(QuickerRpcSubProgramWriteResult.Fail(
            write.IdOrName,
            apply.ErrorMessage ?? "Write failed."));
    }

    public Task<QuickerRpcSubProgramWriteResult> TryCreateAsync(
        QuickerRpcSubProgramCreate create,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = _programs.CreateSubProgram(create.Name, create.Description, create.Icon);
        if (!result.Ok)
        {
            return Task.FromResult(QuickerRpcSubProgramWriteResult.Fail(create.Name, result.Message ?? "Create failed."));
        }

        return Task.FromResult(new QuickerRpcSubProgramWriteResult
        {
            Success = true,
            IdOrName = create.Name,
            SubProgramId = result.SubProgramId,
            EditVersion = result.EditVersion,
            Name = result.Name,
            CallIdentifier = result.CallIdentifier,
            Message = result.Message,
        });
    }

    public Task<QuickerRpcHostMutationResult> TryDeleteAsync(
        string idOrName,
        bool skipConfirm,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = _programs.DeleteSubProgram(idOrName, skipConfirm);
        return Task.FromResult(result.Ok
            ? QuickerRpcHostMutationResult.Ok(result.ActionId, result.Message ?? "Deleted.")
            : QuickerRpcHostMutationResult.Fail(result.Message ?? "Delete failed.", result.ActionId));
    }

    public Task<QuickerRpcApplySubProgramPatchResult> TryApplyPatchAsync(
        string idOrName,
        string patchJson,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.ApplyPatchToSubProgram(
            idOrName,
            patchJson,
            expectedEditVersion,
            force));
    }

    public Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string idOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default) =>
        _variables.EditVariableAsync(idOrName, variableKey, defaultValue);

    public Task<QuickerRpcActionPublishResult> PublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        _publish.PublishSharedSubProgramAsync(subProgramIdOrName, request, cancellationToken);

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        _publish.PreflightPublishSharedSubProgramAsync(subProgramIdOrName, request, cancellationToken);
}
