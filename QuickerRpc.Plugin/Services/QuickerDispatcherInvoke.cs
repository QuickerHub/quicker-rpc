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

    public static void BeginOnUiThreadIfNeeded(Action invoke)
    {
        BeginOnUiThread(invoke, DispatcherPriority.Normal);
    }

  /// <summary>Queue work at <see cref="DispatcherPriority.Background"/> so index builds yield to UI input.</summary>
    public static void BeginOnUiThreadBackground(Action invoke) =>
        BeginOnUiThread(invoke, DispatcherPriority.Background);

    private static void BeginOnUiThread(Action invoke, DispatcherPriority priority)
    {
        var dispatcher = AppDispatcher;
        if (dispatcher is null)
        {
            invoke();
            return;
        }

        if (dispatcher.CheckAccess())
        {
            dispatcher.BeginInvoke(invoke, priority);
            return;
        }

        dispatcher.BeginInvoke(invoke, priority);
    }
}
