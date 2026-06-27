using System;
using System.Net;
using System.Threading.Tasks;

namespace QuickerRpc.Plugin.Services;

internal enum QuickerAgentUiStatus
{
    /// <summary>UI HTTP server reachable; chat page can be embedded.</summary>
    Reachable,

    /// <summary>quicker-agent process exists but no UI port answered (still booting or broken).</summary>
    ProcessRunningNoUi,

    /// <summary>Installed but not running.</summary>
    InstalledNotRunning,

    /// <summary>No NSIS install found and no dev server.</summary>
    NotInstalled,
}

internal readonly struct QuickerAgentUiProbeResult
{
    public QuickerAgentUiProbeResult(QuickerAgentUiStatus status, string? uiBaseUrl)
    {
        Status = status;
        UiBaseUrl = uiBaseUrl;
    }

    public QuickerAgentUiStatus Status { get; }

    /// <summary>e.g. http://127.0.0.1:3000 (no trailing slash); null unless Reachable.</summary>
    public string? UiBaseUrl { get; }
}

/// <summary>
/// Detects the QuickerAgent chat UI endpoint. The Electron shell hosts a Next.js
/// standalone server preferring port 3000 and falling back to the next free port
/// (see agent-gui/electron/backend-spawn.mjs), so a small port range is probed.
/// </summary>
internal static class QuickerAgentUiProbe
{
    private const string Host = "127.0.0.1";
    private const int PreferredPort = 3000;
    private const int ProbePortCount = 8;
    private const int ProbeTimeoutMs = 1200;

    public static async Task<QuickerAgentUiProbeResult> ProbeAsync()
    {
        var url = await TryFindUiBaseUrlAsync().ConfigureAwait(false);
        if (url is not null)
        {
            return new QuickerAgentUiProbeResult(QuickerAgentUiStatus.Reachable, url);
        }

        if (QuickerAgentProductionProcess.IsAnyInstanceRunning())
        {
            return new QuickerAgentUiProbeResult(QuickerAgentUiStatus.ProcessRunningNoUi, null);
        }

        if (QuickerAgentInstallProbe.TryGetExecutablePath(out _))
        {
            return new QuickerAgentUiProbeResult(QuickerAgentUiStatus.InstalledNotRunning, null);
        }

        return new QuickerAgentUiProbeResult(QuickerAgentUiStatus.NotInstalled, null);
    }

    private static async Task<string?> TryFindUiBaseUrlAsync()
    {
        var tasks = new Task<string?>[ProbePortCount];
        for (var i = 0; i < ProbePortCount; i++)
        {
            var port = PreferredPort + i;
            tasks[i] = Task.Run(() => ProbePort(port));
        }

        var results = await Task.WhenAll(tasks).ConfigureAwait(false);

        // Prefer the lowest port (3000 is the canonical instance).
        foreach (var result in results)
        {
            if (result is not null)
            {
                return result;
            }
        }

        return null;
    }

    private static string? ProbePort(int port)
    {
        try
        {
            var request = WebRequest.CreateHttp($"http://{Host}:{port}/api/ping?fast=1");
            request.Method = "GET";
            request.Timeout = ProbeTimeoutMs;
            request.ReadWriteTimeout = ProbeTimeoutMs;
            using var response = (HttpWebResponse)request.GetResponse();
            return response.StatusCode == HttpStatusCode.OK
                ? $"http://{Host}:{port}"
                : null;
        }
        catch
        {
            return null;
        }
    }
}
