using QuickerRpc.Host;

namespace QuickerRpc.Plugin.V2.Composition;

/// <summary>V2 has no WPF dispatcher in the plugin; host ports own thread affinity.</summary>
internal sealed class InlineQuickerRpcCallScheduler : IQuickerRpcCallScheduler
{
    public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) =>
        action();

    public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) =>
        Task.Run(action, cancellationToken);

    public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => action();
}
