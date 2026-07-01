using System;

namespace QuickerRpc.Transport;

/// <summary>Optional sink for plugin hosts (e.g. V2 file log) without Transport → Plugin references.</summary>
public static class TransportDiagnostics
{
    public static Action<string, Exception?>? Sink { get; set; }

    internal static void Write(string message, Exception? ex = null)
    {
        try
        {
            Sink?.Invoke(message, ex);
        }
        catch
        {
            // ignore sink failures
        }
    }
}
