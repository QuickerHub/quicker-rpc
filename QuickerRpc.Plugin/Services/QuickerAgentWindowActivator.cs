using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Brings an existing installed QuickerAgent (Tauri) main window to the foreground on Windows.
/// </summary>
internal static class QuickerAgentWindowActivator
{
    private const string MainWindowTitle = "QuickerAgent";
    private const int SwRestore = 9;
    private const int AsfwAny = -1;

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int dwProcessId);

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    public static bool TryBringToForeground(ILogger? logger = null)
    {
        var processIds = QuickerAgentProductionProcess.CollectAnyProcessIds();
        if (processIds.Count == 0)
        {
            return false;
        }

        var best = FindBestMainWindow(processIds);
        if (best == IntPtr.Zero)
        {
            logger?.LogDebug("QuickerAgent process found but no suitable window handle.");
            return false;
        }

        try
        {
            AllowSetForegroundWindow(AsfwAny);
            if (IsIconic(best))
            {
                ShowWindow(best, SwRestore);
            }

            if (SetForegroundWindow(best))
            {
                return true;
            }

            logger?.LogDebug("SetForegroundWindow returned false for QuickerAgent hwnd {Handle}.", best);
            return false;
        }
        catch (Exception ex)
        {
            logger?.LogDebug(ex, "QuickerAgent foreground activation failed.");
            return false;
        }
    }

    internal static bool IsProcessRunning() => QuickerAgentProductionProcess.IsAnyInstanceRunning();

    private static IntPtr FindBestMainWindow(HashSet<uint> processIds)
    {
        IntPtr titledMatch = IntPtr.Zero;
        IntPtr anyVisible = IntPtr.Zero;

        EnumWindows(
            (hWnd, _) =>
            {
                if (!IsWindowVisible(hWnd))
                {
                    return true;
                }

                GetWindowThreadProcessId(hWnd, out var pid);
                if (!processIds.Contains(pid))
                {
                    return true;
                }

                var title = ReadWindowTitle(hWnd);
                if (title.Length == 0)
                {
                    return true;
                }

                anyVisible = hWnd;
                if (string.Equals(title, MainWindowTitle, StringComparison.Ordinal))
                {
                    titledMatch = hWnd;
                    return false;
                }

                return true;
            },
            IntPtr.Zero);

        return titledMatch != IntPtr.Zero ? titledMatch : anyVisible;
    }

    private static string ReadWindowTitle(IntPtr hWnd)
    {
        var buffer = new StringBuilder(512);
        return GetWindowText(hWnd, buffer, buffer.Capacity) > 0
            ? buffer.ToString().Trim()
            : string.Empty;
    }
}
