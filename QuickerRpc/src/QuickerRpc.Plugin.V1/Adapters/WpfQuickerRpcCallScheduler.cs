using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using QuickerRpc.Host;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class WpfQuickerRpcCallScheduler : IQuickerRpcCallScheduler
{
    public async Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            return await action().ConfigureAwait(true);
        }

        var pending = await dispatcher.InvokeAsync(action, DispatcherPriority.Normal, cancellationToken).Task
            .ConfigureAwait(false);
        return await pending.ConfigureAwait(false);
    }

    public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) =>
        Task.Run(action, cancellationToken);

    public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) =>
        Services.QuickerDispatcherInvoke.OnUiThreadIfNeeded(action);
}
