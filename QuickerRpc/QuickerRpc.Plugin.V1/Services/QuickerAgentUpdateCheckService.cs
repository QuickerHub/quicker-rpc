using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Compares locally installed QuickerAgent with Bitiful <c>version.txt</c>; notifies when newer or not installed.
/// </summary>
public sealed class QuickerAgentUpdateCheckService
{
    public const string VersionTxtUrl =
        "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/version.txt";

    public const string DownloadPrefix =
        "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent";

    // REVERT: set back to null after testing update prompt.
    private const string? TemporaryRemoteVersionOverride = null;

    private readonly ILogger<QuickerAgentUpdateCheckService> _logger;
    private int _checkInFlight;
    private string? _lastNotifiedRemoteVersion;

    public QuickerAgentUpdateCheckService(ILogger<QuickerAgentUpdateCheckService> logger)
    {
        _logger = logger;
    }

    public void ScheduleCheckAndNotify()
    {
        if (Interlocked.CompareExchange(ref _checkInFlight, 1, 0) != 0)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                var result = await CheckForUpdateAsync().ConfigureAwait(false);
                if (result is null || !result.ShouldNotify)
                {
                    return;
                }

                if (string.Equals(result.RemoteVersion, _lastNotifiedRemoteVersion, StringComparison.Ordinal))
                {
                    return;
                }

                _lastNotifiedRemoteVersion = result.RemoteVersion;
                var downloadUrl = result.DownloadUrl;
                var message = BuildNotifyMessage(result);
                QuickerDispatcherInvoke.OnUiThreadIfNeeded(() =>
                    PopupMessage.InformationWithClick(
                        message,
                        () => QuickerAppHelperAccess.TryOpenUrlOrFile(downloadUrl)));
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "QuickerAgent update check failed.");
            }
            finally
            {
                Interlocked.Exchange(ref _checkInFlight, 0);
            }
        });
    }

    internal async Task<QuickerAgentUpdateCheckResult?> CheckForUpdateAsync(CancellationToken cancellationToken = default)
    {
        var remoteVersion = await FetchRemoteVersionAsync(cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(remoteVersion))
        {
            return null;
        }

        var downloadUrl = BuildVersionedDownloadUrl(remoteVersion);

        if (!QuickerAgentInstallProbe.TryGetInstalledVersion(out var installedVersion, out _))
        {
            _logger.LogDebug(
                "QuickerAgent is not installed; offer download for {RemoteVersion}.",
                remoteVersion);
            return new QuickerAgentUpdateCheckResult
            {
                IsNotInstalled = true,
                RemoteVersion = remoteVersion,
                DownloadUrl = downloadUrl,
            };
        }

        var hasUpdate = SemVerUtility.Compare(remoteVersion, installedVersion) > 0;
        return new QuickerAgentUpdateCheckResult
        {
            HasUpdate = hasUpdate,
            InstalledVersion = installedVersion!,
            RemoteVersion = remoteVersion,
            DownloadUrl = downloadUrl,
        };
    }

    internal static async Task<string?> FetchRemoteVersionAsync(CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(TemporaryRemoteVersionOverride)
            && SemVerUtility.TryParse(TemporaryRemoteVersionOverride, out _))
        {
            cancellationToken.ThrowIfCancellationRequested();
            return TemporaryRemoteVersionOverride.Trim();
        }

        using var client = new WebClient();
        client.Headers[HttpRequestHeader.UserAgent] = "QuickerRpc.Plugin";

        var text = await client.DownloadStringTaskAsync(VersionTxtUrl).ConfigureAwait(false);
        var trimmed = (text ?? string.Empty).Trim();
        if (!SemVerUtility.TryParse(trimmed, out _))
        {
            return null;
        }

        cancellationToken.ThrowIfCancellationRequested();
        return trimmed;
    }

    internal static string BuildVersionedDownloadUrl(string remoteVersion) =>
        $"{DownloadPrefix}/quicker-agent-{remoteVersion.Trim()}-x64-setup.exe";

    internal static string BuildNotifyMessage(QuickerAgentUpdateCheckResult result)
    {
        if (result.IsNotInstalled)
        {
            return $"未检测到 QuickerAgent，推荐安装 {result.RemoteVersion}。\r\n" +
                   "点击本通知下载安装包。";
        }

        return $"QuickerAgent 有新版本 {result.RemoteVersion}（当前已安装 {result.InstalledVersion}）。\r\n" +
               "点击本通知下载最新版。";
    }
}

internal sealed class QuickerAgentUpdateCheckResult
{
    public bool HasUpdate { get; set; }

    public bool IsNotInstalled { get; set; }

    public bool ShouldNotify => HasUpdate || IsNotInstalled;

    public string InstalledVersion { get; set; } = string.Empty;

    public string RemoteVersion { get; set; } = string.Empty;

    public string DownloadUrl { get; set; } = string.Empty;
}
