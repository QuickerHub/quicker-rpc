using System;
using System.Threading;
using QuickerRpc.Plugin.Rpc;

namespace QuickerRpc.Plugin;

/// <summary>
/// Plugin bootstrap: starts the named-pipe JSON-RPC server once per Quicker session.
/// </summary>
public static class Launcher
{
    private static readonly object Gate = new();
    private static QuickerRpcServer? _server;
    private static int _started;

    /// <summary>Idempotent start for Register() or manual calls from Quicker actions.</summary>
    public static void EnsureStarted()
    {
        if (Volatile.Read(ref _started) == 1)
        {
            return;
        }

        lock (Gate)
        {
            if (_started == 1)
            {
                return;
            }

            _server = new QuickerRpcServer();
            _server.Start();
            _started = 1;
        }
    }

    /// <summary>Stop the RPC server (mainly for tests).</summary>
    public static void Stop()
    {
        lock (Gate)
        {
            _server?.Stop();
            _server = null;
            _started = 0;
        }
    }
}
