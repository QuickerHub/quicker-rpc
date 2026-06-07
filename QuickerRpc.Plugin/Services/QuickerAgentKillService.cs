using System;
using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Force-terminates running QuickerAgent desktop processes (Tauri).
/// </summary>
internal static class QuickerAgentKillService
{
    internal static readonly string[] KnownProcessNames =
    {
        "quicker-agent",
        "quicker-rpc-agent-gui",
    };

    public static bool TryForceExit(ILogger? logger = null)
    {
        var killedAny = false;

        foreach (var processName in KnownProcessNames)
        {
            Process[] processes;
            try
            {
                processes = Process.GetProcessesByName(processName);
            }
            catch (Exception ex)
            {
                logger?.LogDebug(ex, "Failed to enumerate processes named {ProcessName}.", processName);
                continue;
            }

            foreach (var process in processes)
            {
                using (process)
                {
                    if (TryKillProcess(process, logger))
                    {
                        killedAny = true;
                    }
                }
            }
        }

        return killedAny;
    }

    private static bool TryKillProcess(Process process, ILogger? logger)
    {
        var pid = process.Id;
        try
        {
            if (process.HasExited)
            {
                return false;
            }

            logger?.LogInformation("Killing QuickerAgent process {Pid} ({Name}).", pid, process.ProcessName);
            process.Kill();
            if (!process.WaitForExit(5000))
            {
                logger?.LogWarning("Process {Pid} did not exit within 5s after Kill(); trying taskkill /T.", pid);
                return TryTaskKillTree(pid, logger);
            }

            return true;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "Process.Kill failed for {Pid}; trying taskkill /T.", pid);
            return TryTaskKillTree(pid, logger);
        }
    }

    private static bool TryTaskKillTree(int processId, ILogger? logger)
    {
        try
        {
            using var taskKill = Process.Start(
                new ProcessStartInfo
                {
                    FileName = "taskkill.exe",
                    Arguments = $"/PID {processId} /T /F",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                });

            if (taskKill is null)
            {
                return false;
            }

            if (!taskKill.WaitForExit(8000))
            {
                logger?.LogWarning("taskkill timed out for PID {Pid}.", processId);
                return false;
            }

            return taskKill.ExitCode == 0;
        }
        catch (Exception ex)
        {
            logger?.LogWarning(ex, "taskkill failed for PID {Pid}.", processId);
            return false;
        }
    }
}
