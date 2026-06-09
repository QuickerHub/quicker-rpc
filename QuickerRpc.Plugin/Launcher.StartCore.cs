using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin;

public enum LauncherStatus
{
    NotStarted,
    Starting,
    Started,
    Stopped,
}

public static partial class Launcher
{
    private static readonly object LockObject = new();
    private static readonly int _assemblyResolveRegistered = PluginAssemblyResolve.EnsureRegistered();
    private static readonly IHost _host = CreateHostForQuickerPlugin();
    private static readonly ILogger Logger = _host.Services.GetRequiredService<ILoggerFactory>()
        .CreateLogger(typeof(Launcher));

    private static LauncherStatus _status = LauncherStatus.NotStarted;
    private static volatile bool _launchQuickerAgentAfterStart;
    private static volatile bool _silentStart;
    private static volatile bool _notifyPluginVersion;

    private static void StartCore(LauncherStartOptions? options)
    {
        if (options?.KillQuickerAgent == true)
        {
            var silent = options.Silent;
            _ = Task.Run(() =>
            {
                var killed = QuickerAgentKillService.TryForceExit(Logger);
                if (silent)
                {
                    return;
                }

                QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() =>
                {
                    if (killed)
                    {
                        PopupMessage.Infomation("QuickerAgent 已退出");
                    }
                    else
                    {
                        PopupMessage.Warning("未发现运行中的 QuickerAgent");
                    }
                });
            });

            return;
        }

        if (options?.LaunchQuickerAgent == true)
        {
            _launchQuickerAgentAfterStart = true;
        }

        if (options?.Silent == true)
        {
            _silentStart = true;
        }

        if (options?.NotifyPluginVersion == true)
        {
            _notifyPluginVersion = true;
        }

        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                Logger.LogInformation("QuickerRpc launcher already started");
                var notifyVersion = _notifyPluginVersion;
                var silent = _silentStart;
                var launchAgentUi = _launchQuickerAgentAfterStart;
                _notifyPluginVersion = false;
                _silentStart = false;

                if (notifyVersion)
                {
                    QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(ShowAlreadyRunningVersionPopup);
                }
                else if (!launchAgentUi && !silent)
                {
                    ScheduleQuickerAgentUpdateCheck();
                }

                TryLaunchQuickerAgentIfRequested();
                return;
            }

            if (_status == LauncherStatus.Starting)
            {
                Logger.LogDebug("QuickerRpc launcher start already in progress");
                if (_launchQuickerAgentAfterStart)
                {
                    // A concurrent manual click may arrive while bootstrap is still starting RPC.
                    // StartCoreAsync will honor _launchQuickerAgentAfterStart when startup completes.
                    Logger.LogDebug("QuickerAgent launch queued until RPC startup completes.");
                }

                return;
            }

            if (_status == LauncherStatus.Stopped)
            {
                QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() =>
                    PopupMessage.Warning("动作已停止运行，不能再次启动"));
                return;
            }

            _status = LauncherStatus.Starting;
        }

        _ = Task.Run(StartCoreAsync);
    }

    private static async Task StartCoreAsync()
    {
        try
        {
            await Task.Run(ProgramManager.ExitOtherVersionPlugins).ConfigureAwait(false);
            StepRunnerRegistration.RegisterPluginStepRunners(Logger);

            var shouldStartHost = false;
            lock (LockObject)
            {
                shouldStartHost = _status == LauncherStatus.Starting;
            }

            if (!shouldStartHost)
            {
                var showExitPopup = false;
                lock (LockObject)
                {
                    showExitPopup = _status == LauncherStatus.Stopped;
                }

                if (showExitPopup)
                {
                    QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(ShowExitPopup);
                }

                return;
            }

            await _host.StartAsync(CancellationToken.None).ConfigureAwait(false);

            LauncherStatus statusAfterStart;
            lock (LockObject)
            {
                statusAfterStart = _status;
                if (_status == LauncherStatus.Starting)
                {
                    _status = LauncherStatus.Started;
                }
            }

            if (statusAfterStart == LauncherStatus.Stopped)
            {
                await _host.StopAsync(CancellationToken.None).ConfigureAwait(false);
                QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(ShowExitPopup);
                return;
            }

            if (statusAfterStart == LauncherStatus.Starting)
            {
                Logger.LogInformation("QuickerRpc launcher started");
                var silent = _silentStart;
                var notifyVersion = _notifyPluginVersion;
                _silentStart = false;
                _notifyPluginVersion = false;
                if (notifyVersion)
                {
                    QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(ShowStartedVersionPopup);
                }

                if (!silent)
                {
                    ScheduleQuickerAgentUpdateCheck();
                }

                TryLaunchQuickerAgentIfRequested();
            }
        }
        catch (Exception ex)
        {
            lock (LockObject)
            {
                if (_status == LauncherStatus.Starting)
                {
                    _status = LauncherStatus.NotStarted;
                }
            }

            var silent = _silentStart;
            _silentStart = false;
            _notifyPluginVersion = false;
            Logger.LogError(ex, "QuickerRpc launcher start failed");
            if (!silent)
            {
                QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() => PopupMessage.Warning(ex.Message));
            }
        }
    }

    private static void ScheduleQuickerAgentUpdateCheck()
    {
        try
        {
            GetService<QuickerAgentUpdateCheckService>().ScheduleCheckAndNotify();
        }
        catch (Exception ex)
        {
            Logger.LogDebug(ex, "QuickerAgent update check skipped.");
        }
    }

    private static void TryLaunchQuickerAgentIfRequested()
    {
        if (!_launchQuickerAgentAfterStart)
        {
            return;
        }

        _launchQuickerAgentAfterStart = false;
        _ = Task.Run(() =>
        {
            var outcome = QuickerAgentLaunchService.TryLaunchOrActivate(Logger);
            QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(
                () => QuickerAgentLaunchNotifier.Notify(outcome, Logger));
        });
    }

    private static void ShowAlreadyRunningVersionPopup() =>
        PopupMessage.Success("动作已在运行，版本号:" + GetPluginVersion());

    private static void ShowStartedVersionPopup() =>
        PopupMessage.Success("动作已启动，版本号:" + GetPluginVersion());

    private static string GetPluginVersion() =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";
}
