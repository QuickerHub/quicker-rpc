using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1TriggerHost : IQuickerRpcTriggerHost
{
    private readonly TriggerTaskService _triggers;

    public V1TriggerHost(TriggerTaskService triggers) => _triggers = triggers;

    public Task<QuickerRpcTriggerListResult> ListAsync(
        string? query = null,
        string? eventType = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_triggers.List(query, eventType));
    }

    public Task<QuickerRpcTriggerEventTypesResult> ListEventTypesAsync(
        string? eventType = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_triggers.ListEventTypes(eventType));
    }

    public Task<QuickerRpcTriggerSaveResult> SaveAsync(
        QuickerRpcTriggerTaskInfo task,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_triggers.Save(task));
    }

    public Task<QuickerRpcTriggerDeleteResult> DeleteAsync(
        string id,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_triggers.Delete(id));
    }

    public Task<QuickerRpcTriggerSaveResult> SetEnabledAsync(
        string id,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_triggers.SetEnabled(id, enabled));
    }
}
