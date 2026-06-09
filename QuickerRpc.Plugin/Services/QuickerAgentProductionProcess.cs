using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Distinguishes NSIS-installed QuickerAgent from repo dev builds (agent-gui / tauri target).
/// Mirrors agent-gui/lib/quicker-agent-install-probe.mjs and start-agent-gui.ps1.
/// </summary>
internal static class QuickerAgentProductionProcess
{
    private static readonly string[] DevPathMarkers =
    {
        @"\agent-gui\",
        @"\src-tauri\target\",
    };

    public static bool IsAnyInstanceRunning() => CollectAnyProcessIds().Count > 0;

    public static bool IsInstalledInstanceRunning() => CollectInstalledProcessIds().Count > 0;

    public static HashSet<uint> CollectAnyProcessIds()
    {
        var ids = new HashSet<uint>();
        try
        {
            foreach (var process in Process.GetProcessesByName("quicker-agent"))
            {
                using (process)
                {
                    ids.Add((uint)process.Id);
                }
            }
        }
        catch
        {
            return ids;
        }

        return ids;
    }

    public static HashSet<uint> CollectInstalledProcessIds()
    {
        var ids = new HashSet<uint>();
        try
        {
            foreach (var process in Process.GetProcessesByName("quicker-agent"))
            {
                using (process)
                {
                    if (IsInstalledProductionExecutablePath(TryReadProcessImagePath(process)))
                    {
                        ids.Add((uint)process.Id);
                    }
                }
            }
        }
        catch
        {
            return ids;
        }

        return ids;
    }

    public static bool IsInstalledProductionExecutablePath(string? executablePath)
    {
        var normalized = NormalizePath(executablePath);
        if (string.IsNullOrEmpty(normalized))
        {
            return false;
        }

        if (IsDevBuildPath(normalized))
        {
            return false;
        }

        if (!normalized.EndsWith(@"\quicker-agent.exe", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        foreach (var candidate in QuickerAgentInstallProbe.EnumerateInstalledExecutableCandidates())
        {
            if (string.Equals(NormalizePath(candidate), normalized, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        // NSIS default: %LOCALAPPDATA%\QuickerAgent\quicker-agent.exe (also under Programs\).
        var directory = Path.GetDirectoryName(normalized);
        if (string.IsNullOrWhiteSpace(directory))
        {
            return false;
        }

        var parent = Path.GetFileName(directory);
        return parent.Equals("QuickerAgent", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsDevBuildPath(string normalizedPath)
    {
        foreach (var marker in DevPathMarkers)
        {
            if (normalizedPath.IndexOf(marker, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }
        }

        return false;
    }

    private static string? TryReadProcessImagePath(Process process)
    {
        try
        {
            return process.MainModule?.FileName;
        }
        catch
        {
            return null;
        }
    }

    private static string NormalizePath(string? path)
    {
        var trimmed = (path ?? string.Empty).Trim().Trim('"');
        return trimmed.Length == 0 ? string.Empty : trimmed.Replace('/', '\\');
    }
}
