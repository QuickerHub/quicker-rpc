using System;
using System.Windows.Threading;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerDispatcherInvoke
{
    public static T? OnUiThreadIfNeeded<T>(Func<T?> invoke)
    {
        var dispatcher = Dispatcher.CurrentDispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            return invoke();
        }

        return dispatcher.Invoke(invoke);
    }
}
