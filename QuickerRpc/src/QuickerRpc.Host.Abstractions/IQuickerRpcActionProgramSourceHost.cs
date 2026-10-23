using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Optional V1 port for reversible native program source reads and writes.</summary>
public interface IQuickerRpcActionProgramSourceHost
{
    Task<QuickerRpcGetActionProgramSourceResult> GetProgramSourceAsync(
        string actionId,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcApplyXActionResult> ApplyProgramSourceAsync(
        string actionId,
        string bodyJson,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken = default);
}
