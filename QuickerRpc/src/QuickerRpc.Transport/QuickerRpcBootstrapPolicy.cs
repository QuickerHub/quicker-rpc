using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace QuickerRpc.Transport;

/// <summary>Guards quicker:runaction bootstrap (serve health polls, MCP, CLI reconnect).</summary>
public static class QuickerRpcBootstrapPolicy
{
    /// <summary>Minimum interval between quicker:runaction launches in one process.</summary>
    public const int DefaultCooldownSeconds = 120;

    private static readonly object Gate = new();
    private static DateTime _lastLaunchUtc = DateTime.MinValue;
    private static int _cooldownSeconds = DefaultCooldownSeconds;

    /// <summary>Override cooldown (seconds). For tests or env tuning.</summary>
    public static int CooldownSeconds
    {
        get
        {
            lock (Gate)
            {
                return _cooldownSeconds;
            }
        }
        set
        {
            lock (Gate)
            {
                _cooldownSeconds = Math.Max(0, value);
            }
        }
    }

    public static bool IsQuickerProcessRunning()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return false;
        }

        try
        {
            return Process.GetProcessesByName("Quicker").Length > 0;
        }
        catch
        {
            return false;
        }
    }

    public static bool WasBootstrapRecentlyAttempted()
    {
        lock (Gate)
        {
            if (_lastLaunchUtc == DateTime.MinValue)
            {
                return false;
            }

            return (DateTime.UtcNow - _lastLaunchUtc).TotalSeconds < _cooldownSeconds;
        }
    }

    /// <summary>Call after a successful pipe connect so the next outage can bootstrap again.</summary>
    public static void ResetCooldown()
    {
        lock (Gate)
        {
            _lastLaunchUtc = DateTime.MinValue;
        }
    }

    /// <summary>
    /// Returns true when quicker:runaction was launched; false when skipped (Quicker down or cooldown).
    /// </summary>
    public static bool TryLaunchPluginRunAction(bool bypassCooldown = false)
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return false;
        }

        lock (Gate)
        {
            if (!IsQuickerProcessRunning())
            {
                return false;
            }

            if (!bypassCooldown
                && _lastLaunchUtc != DateTime.MinValue
                && (DateTime.UtcNow - _lastLaunchUtc).TotalSeconds < _cooldownSeconds)
            {
                return false;
            }

            _lastLaunchUtc = DateTime.UtcNow;
        }

        try
        {
            Process.Start(
                new ProcessStartInfo(QuickerRpcBootstrap.BuildRunActionUri())
                {
                    UseShellExecute = true,
                });
            return true;
        }
        catch
        {
            return false;
        }
    }
}
