using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Starts the installed QuickerAgent (Tauri) desktop app if not already running.
/// </summary>
internal static class QuickerAgentLaunchService
{
    private const string ProcessNameWithoutExtension = "quicker-agent";

    public static bool TryLaunch(ILogger logger)
    {
        if (IsAlreadyRunning())
        {
            logger.LogDebug("QuickerAgent already running; skip launch.");
            return true;
        }

        if (!QuickerAgentInstallProbe.TryGetExecutablePath(out var executablePath))
        {
            logger.LogInformation("QuickerAgent is not installed; skip launch.");
            return false;
        }

        try
        {
            Process.Start(
                new ProcessStartInfo(executablePath!)
                {
                    WorkingDirectory = Path.GetDirectoryName(executablePath!) ?? Environment.CurrentDirectory,
                    UseShellExecute = true,
                });
            logger.LogInformation("QuickerAgent launched from {Path}", executablePath);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to launch QuickerAgent from {Path}", executablePath);
            return false;
        }
    }

    private static bool IsAlreadyRunning()
    {
        try
        {
            return Process.GetProcessesByName(ProcessNameWithoutExtension).Length > 0;
        }
        catch
        {
            return false;
        }
    }
}
