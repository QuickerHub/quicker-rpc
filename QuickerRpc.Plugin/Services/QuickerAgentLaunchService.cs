using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using Microsoft.Extensions.Logging;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Starts the installed QuickerAgent (Tauri) desktop app if not already running.
/// </summary>
internal static class QuickerAgentLaunchService
{
    private const string DevFrontendPingUrl = "http://127.0.0.1:3000/api/ping?fast=1";
    private const string DevFrontendOpenUrl = "http://127.0.0.1:3000/";

    public static QuickerAgentLaunchOutcome TryLaunchOrActivate(ILogger logger)
    {
        if (QuickerAgentWindowActivator.IsProcessRunning())
        {
            if (QuickerAgentWindowActivator.TryBringToForeground(logger))
            {
                logger.LogInformation("QuickerAgent already running; brought main window to foreground.");
                return QuickerAgentLaunchOutcome.Activated;
            }

            logger.LogInformation(
                "QuickerAgent process(es) found without an activatable main window; attempting fresh launch.");
        }

        var hasInstalledBuild = QuickerAgentInstallProbe.TryGetExecutablePath(out var executablePath);

        if (hasInstalledBuild)
        {
            if (TryLaunchInstalledExecutable(executablePath!, logger))
            {
                return QuickerAgentLaunchOutcome.Launched;
            }

            if (QuickerAgentWindowActivator.IsProcessRunning())
            {
                logger.LogDebug("QuickerAgent launch failed while process handle(s) still present.");
                return QuickerAgentLaunchOutcome.RunningButHidden;
            }

            return QuickerAgentLaunchOutcome.Failed;
        }

        // No NSIS install — optional dev server on :3000 (pwsh ./dev.ps1 browser mode).
        if (TryOpenDevFrontend(logger))
        {
            return QuickerAgentLaunchOutcome.DevFrontendOpened;
        }

        if (QuickerAgentWindowActivator.IsProcessRunning())
        {
            return QuickerAgentLaunchOutcome.RunningButHidden;
        }

        logger.LogInformation("QuickerAgent is not installed; skip launch.");
        return QuickerAgentLaunchOutcome.NotInstalled;
    }

    private static bool TryLaunchInstalledExecutable(string executablePath, ILogger logger)
    {
        try
        {
            Process.Start(
                new ProcessStartInfo(executablePath)
                {
                    WorkingDirectory = Path.GetDirectoryName(executablePath) ?? Environment.CurrentDirectory,
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

    private static bool TryOpenDevFrontend(ILogger logger)
    {
        if (!IsDevFrontendReachable())
        {
            return false;
        }

        try
        {
            Process.Start(
                new ProcessStartInfo(DevFrontendOpenUrl)
                {
                    UseShellExecute = true,
                });
            logger.LogInformation("Opened QuickerAgent dev frontend at {Url}", DevFrontendOpenUrl);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to open QuickerAgent dev frontend.");
            return false;
        }
    }

    private static bool IsDevFrontendReachable()
    {
        try
        {
            var request = WebRequest.Create(DevFrontendPingUrl);
            request.Method = "GET";
            request.Timeout = 1500;
            using var response = (HttpWebResponse)request.GetResponse();
            return response.StatusCode == HttpStatusCode.OK;
        }
        catch
        {
            return false;
        }
    }
}
