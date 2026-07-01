using System;
using System.Threading;
using System.Windows;
using System.Windows.Threading;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerDispatcherInvoke
{
    /// <summary>Max wait for cross-thread UI work (apply/export/designer refresh).</summary>
    public static readonly TimeSpan DefaultUiOperationTimeout = TimeSpan.FromSeconds(5);

    /// <summary>Short cap for read-only designer window scans (get/export probe).</summary>
    public static readonly TimeSpan DesignerUiReadTimeout = TimeSpan.FromSeconds(3);

    /// <summary>Quicker main WPF dispatcher; not <see cref="Dispatcher.CurrentDispatcher"/> (wrong on expression worker threads).</summary>
    public static Dispatcher? AppDispatcher =>
        Application.Current?.Dispatcher;

    public static T? OnUiThreadIfNeeded<T>(Func<T?> invoke)
    {
        if (TryOnUiThreadIfNeeded(invoke, DefaultUiOperationTimeout, out var result))
        {
            return result;
        }

        System.Diagnostics.Trace.TraceWarning("[QuickerRpc.Plugin] UI thread timed out; skipped cross-thread work.");
        return default;
    }

    public static void OnUiThreadIfNeeded(Action invoke)
    {
        if (!TryOnUiThreadIfNeeded(invoke, DefaultUiOperationTimeout))
        {
            System.Diagnostics.Trace.TraceWarning("[QuickerRpc.Plugin] UI thread timed out; skipped cross-thread work.");
        }
    }

    public static bool TryOnUiThreadIfNeeded(Action invoke, TimeSpan timeout)
    {
        var dispatcher = AppDispatcher;
        if (dispatcher is null)
        {
            invoke();
            return true;
        }

        if (dispatcher.CheckAccess())
        {
            invoke();
            return true;
        }

        var operation = dispatcher.InvokeAsync(invoke, DispatcherPriority.Normal);
        return WaitForDispatcherOperation(operation, timeout);
    }

    public static bool TryOnUiThreadIfNeeded<T>(
        Func<T?> invoke,
        TimeSpan timeout,
        out T? result)
    {
        var dispatcher = AppDispatcher;
        if (dispatcher is null)
        {
            result = invoke();
            return true;
        }

        if (dispatcher.CheckAccess())
        {
            result = invoke();
            return true;
        }

        T? captured = default;
        var operation = dispatcher.InvokeAsync(
            () => captured = invoke(),
            DispatcherPriority.Normal);
        if (!WaitForDispatcherOperation(operation, timeout))
        {
            result = default;
            return false;
        }

        result = captured;
        return true;
    }

    private static bool WaitForDispatcherOperation(DispatcherOperation operation, TimeSpan timeout)
    {
        if (timeout <= TimeSpan.Zero)
        {
            operation.Wait();
            return true;
        }

        using var waitHandle = new ManualResetEventSlim(false);
        operation.Completed += (_, _) => waitHandle.Set();
        if (operation.Status == DispatcherOperationStatus.Completed)
        {
            return true;
        }

        return waitHandle.Wait(timeout);
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
