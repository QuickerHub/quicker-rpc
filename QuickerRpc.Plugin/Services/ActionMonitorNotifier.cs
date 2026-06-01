using System;

namespace QuickerRpc.Plugin.Services;

/// <summary>Signals that the local action catalog may have changed (for monitor UI refresh).</summary>
internal static class ActionMonitorNotifier
{
    public static event EventHandler? CatalogChanged;

    public static void Notify()
    {
        CatalogChanged?.Invoke(null, EventArgs.Empty);
    }
}
