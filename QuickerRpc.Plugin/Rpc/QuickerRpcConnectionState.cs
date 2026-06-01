using System;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>Tracks whether a JSON-RPC client is connected to the named pipe server.</summary>
internal static class QuickerRpcConnectionState
{
    public static bool IsClientConnected { get; private set; }

    public static event EventHandler? Changed;

    public static void SetConnected(bool connected)
    {
        if (IsClientConnected == connected)
        {
            return;
        }

        IsClientConnected = connected;
        Changed?.Invoke(null, EventArgs.Empty);
    }
}
