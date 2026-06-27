using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1StepRunnerHost : IQuickerRpcStepRunnerHost
{
    private readonly HeadlessActionProgramService _programs;

    public V1StepRunnerHost(HeadlessActionProgramService programs) => _programs = programs;

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
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_programs.GetStepRunnerUiDetail(stepRunnerKey, controlFieldValue));
    }

    public Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(
            QuickerDispatcherInvoke.OnUiThreadIfNeeded(
                () => ActionStepSummaryService.GetSummaries(steps, embeddedSubProgramsJson))
            ?? new QuickerRpcActionStepSummariesResult
            {
                Success = false,
                ErrorMessage = "Step summaries unavailable.",
            });
    }
}
