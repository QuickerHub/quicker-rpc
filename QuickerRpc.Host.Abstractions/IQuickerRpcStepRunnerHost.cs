using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>StepRunner catalog from the Quicker runtime.</summary>
public interface IQuickerRpcStepRunnerHost
{
    Task<QuickerRpcSearchStepRunnersResult> SearchAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcSearchStepRunnersResult> ListAsync(
        int? maxResults = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcStepRunnerDetailResult> GetDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcStepRunnerDetailResult> GetUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default);
}
