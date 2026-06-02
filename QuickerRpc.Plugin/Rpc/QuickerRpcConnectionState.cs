using System;
using System.Threading;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>Tracks whether a JSON-RPC client is connected to the named pipe server.</summary>
internal static class QuickerRpcConnectionState
{
    private static int _connectionCount;
    public static bool IsClientConnected { get; private set; }

    public static event EventHandler? Changed;

    public static void SetConnected(bool connected)
    {
        if (connected)
        {
            UpdateConnectionCount(1);
            return;
        }

        UpdateConnectionCount(-1);
    }

    private static void UpdateConnectionCount(int delta)
    {
        var next = Interlocked.Add(ref _connectionCount, delta);
        if (next < 0)
        {
            Interlocked.Exchange(ref _connectionCount, 0);
            next = 0;
        }

        var connected = next > 0;
        if (IsClientConnected == connected)
        {
            return;
        }

        IsClientConnected = connected;
        Changed?.Invoke(null, EventArgs.Empty);
    }
}
