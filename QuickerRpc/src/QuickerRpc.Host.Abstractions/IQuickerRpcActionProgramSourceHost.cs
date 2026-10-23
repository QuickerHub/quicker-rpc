using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Optional port for reversible native program source reads and writes.</summary>
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
        QuickerRpcActionStorageIdentity? storageIdentity = null,
        CancellationToken cancellationToken = default);
}

/// <summary>Optional probe for adapters whose native storage APIs may be absent in older hosts.</summary>
public interface IQuickerRpcActionProgramSourceAvailability
{
    bool IsProgramSourceAvailable { get; }
}
