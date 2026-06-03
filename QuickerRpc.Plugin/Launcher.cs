using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Services;
using Z.Expressions;

namespace QuickerRpc.Plugin;

public enum LauncherStatus
{
    NotStarted,
    Starting,
    Started,
    Stopped,
}

/// <summary>
/// Quicker plugin composition root: DI host + named-pipe RPC <see cref="Rpc.QuickerRpcServer"/>.
/// </summary>
public static partial class Launcher
{
    private static readonly object LockObject = new();
    private static readonly IHost _host = CreateHostForQuickerPlugin();
    private static readonly ILogger Logger = _host.Services.GetRequiredService<ILoggerFactory>()
        .CreateLogger(typeof(Launcher));

    private static LauncherStatus _status = LauncherStatus.NotStarted;

    public static T GetService<T>()
        where T : class =>
        AppServices.GetRequired<T>();

    /// <summary>
    /// Quicker expression entry: <c>type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}</c>.
    /// </summary>
    public static bool Register(EvalContext eval)
    {
        eval.RegisterType(typeof(Launcher));
        Start();
        return true;
    }

    /// <summary>Starts the RPC host without blocking the caller or UI thread.</summary>
    public static void Start()
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                Logger.LogInformation("QuickerRpc launcher already started");
                QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() =>
                    PopupMessage.Success("动作已在运行，版本号:" + GetPluginVersion()));
                ScheduleQuickerAgentUpdateCheck();
                return;
            }

            if (_status == LauncherStatus.Starting)
            {
                Logger.LogDebug("QuickerRpc launcher start already in progress");
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

            Logger.LogError(ex, "QuickerRpc launcher start failed");
            QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() => PopupMessage.Warning(ex.Message));
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

    public static void Stop()
    {
        lock (LockObject)
        {
            StopCore();
        }
    }

    /// <summary>
    /// Stops the DI host and RPC server. For Quicker expression / subprogram teardown.
    /// </summary>
    public static void Exit()
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Stopped)
            {
                return;
            }

            if (_status == LauncherStatus.Starting)
            {
                _status = LauncherStatus.Stopped;
                return;
            }

            StopCore();
            QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(ShowExitPopup);
        }
    }

    private static void ShowExitPopup()
    {
        PopupMessage.Infomation("动作已退出，版本号:" + GetPluginVersion());
    }

    private static string GetPluginVersion() =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";

    private static void StopCore()
    {
        if (_status != LauncherStatus.Started)
        {
            return;
        }

        try
        {
            _host.StopAsync().GetAwaiter().GetResult();
            _status = LauncherStatus.Stopped;
            Logger.LogInformation("QuickerRpc launcher stopped");
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Error stopping QuickerRpc services");
        }
    }
}
