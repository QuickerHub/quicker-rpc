using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Optional runtime-definition port, independent of Designer and legacy compressed get.</summary>
public interface IQuickerRpcStepRunnerInputContractHost
{
    bool IsInputContractAvailable { get; }
    Task<QuickerRpcStepRunnerInputContractResult> GetStepRunnerInputContractAsync(
        QuickerRpcStepRunnerInputContractRequest request, CancellationToken cancellationToken = default);
}
