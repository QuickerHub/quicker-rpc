using System;
using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Host;

/// <summary>Marshals RPC handler work to UI or background threads (WPF in V1; no-op/sync in V2).</summary>
public interface IQuickerRpcCallScheduler
{
    Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default);

    Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default);

    /// <summary>Synchronous UI hop when already on UI thread; used for settings/trigger search paths.</summary>
    T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action);
}
