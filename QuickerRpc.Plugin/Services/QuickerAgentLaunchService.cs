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
    public static bool TryLaunchOrActivate(ILogger logger)
    {
        if (QuickerAgentWindowActivator.IsProcessRunning())
        {
            if (QuickerAgentWindowActivator.TryBringToForeground(logger))
            {
                logger.LogInformation("QuickerAgent already running; brought main window to foreground.");
            }
            else
            {
                logger.LogDebug("QuickerAgent already running; foreground activation did not succeed.");
            }

            return true;
        }

        return TryLaunch(logger);
    }

    public static bool TryLaunch(ILogger logger)
    {
        if (QuickerAgentWindowActivator.IsProcessRunning())
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

}
