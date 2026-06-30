using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2SessionHost : IQuickerRpcSessionHost
{
    public Task<QuickerRpcAccountInfo> GetAccountAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerV2AccountAccessor.TryGetAccountInfo());
    }

    public Task<QuickerRpcWebSessionInfo> GetWebSessionAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(QuickerV2AccountAccessor.TryGetWebSessionInfo());
    }
}

internal sealed class V2ActionProgramHost : IQuickerRpcActionProgramHost
{
    private readonly V2HeadlessActionProgramService _programs;

    public V2ActionProgramHost(V2HeadlessActionProgramService programs) => _programs = programs;

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
        return Task.FromResult(_programs.ApplyActionPatchToAction(actionId, patchJson, expectedEditVersion, force));
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

internal sealed class V2SubProgramHost : IQuickerRpcSubProgramHost
{
    private readonly V2HeadlessSubProgramService _programs;

    public V2SubProgramHost(V2HeadlessSubProgramService programs) => _programs = programs;

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
        CancellationToken cancellationToken = default) =>
        Task.FromResult(QuickerRpcSubProgramWriteResult.Fail(create.Name, "Create subprogram is not implemented for V2 reflection host yet."));

    public Task<QuickerRpcHostMutationResult> TryDeleteAsync(
        string idOrName,
        bool skipConfirm,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(QuickerRpcHostMutationResult.Fail("Delete subprogram is not implemented for V2 reflection host yet.", idOrName));

    public Task<QuickerRpcApplySubProgramPatchResult> TryApplyPatchAsync(
        string idOrName,
        string patchJson,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.ApplyPatchToSubProgram(idOrName, patchJson, expectedEditVersion, force));
    }

    public Task<QuickerRpcSubProgramVariableEditResult> EditVariableAsync(
        string idOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.EditVariable(idOrName, variableKey, defaultValue));
    }
}

internal sealed class V2StepRunnerHost : IQuickerRpcStepRunnerHost
{
    private readonly V2HeadlessActionProgramService _programs;

    public V2StepRunnerHost(V2HeadlessActionProgramService programs) => _programs = programs;

    public Task<QuickerRpcSearchStepRunnersResult> SearchAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.SearchStepRunners(keyword, maxResults));
    }

    public Task<QuickerRpcSearchStepRunnersResult> ListAsync(
        int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.ListStepRunners(maxResults));
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.GetStepRunnerDetail(stepRunnerKey, controlFieldValue));
    }

    public Task<QuickerRpcStepRunnerDetailResult> GetUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default) =>
        GetDetailAsync(stepRunnerKey, controlFieldValue, cancellationToken);

    public Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (steps.Count == 0)
        {
            return Task.FromResult(new QuickerRpcActionStepSummariesResult
            {
                Success = true,
                Items = [],
            });
        }

        return Task.FromResult(new QuickerRpcActionStepSummariesResult
        {
            Success = false,
            ErrorMessage = "Step summaries are not implemented for V2 reflection host yet.",
        });
    }
}
