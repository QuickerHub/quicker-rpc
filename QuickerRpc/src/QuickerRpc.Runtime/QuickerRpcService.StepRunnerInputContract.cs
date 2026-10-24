using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime;

public sealed partial class QuickerRpcService
{
    public async Task<QuickerRpcStepRunnerInputContractResult> GetStepRunnerInputContractAsync(
        QuickerRpcStepRunnerInputContractRequest request, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request is null || string.IsNullOrWhiteSpace(request.StepRunnerKey))
            return StepRunnerInputContractBuilder.Failure("INVALID_INPUT_CONTRACT_REQUEST", "A step runner key is required.");
        var port = _host.StepRunners as IQuickerRpcStepRunnerInputContractHost;
        if (port is null || !port.IsInputContractAvailable)
            return StepRunnerInputContractBuilder.Failure("UNSUPPORTED_HOST", "The selected host does not provide runtime input contracts.");
        cancellationToken.ThrowIfCancellationRequested();
        var normalized = new QuickerRpcStepRunnerInputContractRequest
        {
            StepRunnerKey = request.StepRunnerKey.Trim(), ControlFieldValue = request.ControlFieldValue,
        };
        var result = await InvokeOnDispatcherAsync(() => port.GetStepRunnerInputContractAsync(normalized, cancellationToken), cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        return result;
    }
}
