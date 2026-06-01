using System;
using System.Windows;
using System.Windows.Threading;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerDispatcherInvoke
{
    /// <summary>Quicker main WPF dispatcher; not <see cref="Dispatcher.CurrentDispatcher"/> (wrong on expression worker threads).</summary>
    public static Dispatcher? AppDispatcher =>
        Application.Current?.Dispatcher;

    public static T? OnUiThreadIfNeeded<T>(Func<T?> invoke)
    {
        var dispatcher = AppDispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            return invoke();
        }

        return dispatcher.Invoke(invoke);
    }

    public static void OnUiThreadIfNeeded(Action invoke)
    {
        var dispatcher = AppDispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            invoke();
            return;
        }

        dispatcher.Invoke(invoke);
    }
}
