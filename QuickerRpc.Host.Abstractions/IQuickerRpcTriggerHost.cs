using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Event trigger task configuration (optional port).</summary>
public interface IQuickerRpcTriggerHost
{
    Task<QuickerRpcTriggerListResult> ListAsync(
        string? query = null,
        string? eventType = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcTriggerEventTypesResult> ListEventTypesAsync(
        string? eventType = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcTriggerSaveResult> SaveAsync(
        QuickerRpcTriggerTaskInfo task,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcTriggerDeleteResult> DeleteAsync(
        string id,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcTriggerSaveResult> SetEnabledAsync(
        string id,
        bool enabled,
        CancellationToken cancellationToken = default);
}
