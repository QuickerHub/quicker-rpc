using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Quicker.Public.Interfaces;
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
    private static volatile bool _launchQuickerAgentAfterStart;
    private static volatile bool _silentStart;

    public static T GetService<T>()
        where T : class =>
        AppServices.GetRequired<T>();

    /// <summary>
    /// Quicker expression entry: <c>type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}</c>.
    /// </summary>
    public static bool Register(EvalContext eval)
    {
        eval.RegisterType(typeof(Launcher));
        eval.RegisterType(typeof(LauncherStartOptions));
        eval.RegisterType(typeof(LauncherStartOptionsParser));
        eval.RegisterType(typeof(LauncherStartOptionsResolver));
        Start(LauncherStartOptionsParser.PluginOnly());
        return true;
    }

    /// <summary>Starts the RPC host without blocking the caller or UI thread.</summary>
    public static void Start() => Start((IActionContext?)null);

    /// <summary>Starts the RPC host; uses <see cref="ActionExecuteContext.ActionTrigger"/> to force plugin-only on external runs.</summary>
    public static void Start(IActionContext? context) => Start(context, explicitOptions: null);

    /// <summary>Maps <c>quicker_in_param</c> and <paramref name="context"/>; external trigger always plugin-only.</summary>
    public static void StartFromQuickerInParam(string? quickerInParam, IActionContext? context) =>
        Start(LauncherStartOptionsResolver.Resolve(context, quickerInParam));

    /// <summary>Legacy overload without action context.</summary>
    public static void StartFromQuickerInParam(string? quickerInParam) =>
        StartFromQuickerInParam(quickerInParam, context: null);

    /// <summary>Starts the RPC host; optionally launches installed QuickerAgent when ready.</summary>
    public static void Start(bool launchQuickerAgent) =>
        Start(new LauncherStartOptions { LaunchQuickerAgent = launchQuickerAgent });

    /// <summary>Starts the RPC host with explicit options and optional <paramref name="context"/>.</summary>
    public static void Start(IActionContext? context, LauncherStartOptions? explicitOptions) =>
        Start(LauncherStartOptionsResolver.Resolve(context, explicitOptions: explicitOptions));

    /// <summary>Starts the RPC host with <see cref="LauncherStartOptions"/>.</summary>
    public static void Start(LauncherStartOptions? options)
    {
        if (options?.LaunchQuickerAgent == true)
        {
            _launchQuickerAgentAfterStart = true;
        }

        if (options?.Silent == true)
        {
            _silentStart = true;
        }

        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                Logger.LogInformation("QuickerRpc launcher already started");
                if (!_silentStart)
                {
                    QuickerDispatcherInvoke.BeginOnUiThreadIfNeeded(() =>
                        PopupMessage.Success("动作已在运行，版本号:" + GetPluginVersion()));
                    ScheduleQuickerAgentUpdateCheck();
                }

                TryLaunchQuickerAgentIfRequested();
                _silentStart = false;
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
                var silent = _silentStart;
                _silentStart = false;
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
        _ = Task.Run(() => QuickerAgentLaunchService.TryLaunch(Logger));
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
