using System;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
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
    public static bool Register(EvalContext eval, bool openMonitor = false)
    {
        eval.RegisterType(typeof(Launcher));
        Start(openMonitor);
        return true;
    }

    /// <summary>Starts the RPC host. Set <paramref name="openMonitor"/> to show the monitor window after start.</summary>
    public static void Start(bool openMonitor = false)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is not null && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(() => StartCore(openMonitor));
            return;
        }

        StartCore(openMonitor);
    }

    private static void StartCore(bool openMonitor)
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                Logger.LogInformation("QuickerRpc launcher already started");
                if (!openMonitor)
                {
                    var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";
                    PopupMessage.Success("动作已在运行，版本号:" + version);
                }
                else
                {
                    ShowMonitorCore();
                }

                return;
            }

            if (_status == LauncherStatus.Stopped)
            {
                PopupMessage.Warning("动作已停止运行，不能再次启动");
                return;
            }

            try
            {
                WaitForPriorQuickerRpcExitWithUiPump();
                StepRunnerRegistration.RegisterPluginStepRunners(Logger);

                _host.StartAsync().GetAwaiter().GetResult();
                _status = LauncherStatus.Started;
                Logger.LogInformation("QuickerRpc launcher started");

                if (openMonitor)
                {
                    ShowMonitorCore();
                }
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "QuickerRpc launcher start failed");
                PopupMessage.Warning(ex.Message);
                throw;
            }
        }
    }

    /// <summary>Opens the QuickerRpc monitor window (agent virtual page + recently edited actions).</summary>
    public static void ShowMonitor()
    {
        QuickerDispatcherInvoke.OnUiThreadIfNeeded(ShowMonitorOnUiThread);
    }

    /// <summary>Shows the monitor window if hidden; closes it if already visible.</summary>
    public static void ToggleMonitor()
    {
        QuickerDispatcherInvoke.OnUiThreadIfNeeded(ToggleMonitorOnUiThread);
    }

    private static void ShowMonitorOnUiThread()
    {
        if (_status != LauncherStatus.Started)
        {
            PopupMessage.Warning("请先启动 QuickerRpc（Launcher.Start）。");
            return;
        }

        ShowMonitorCore();
    }

    private static void ToggleMonitorOnUiThread()
    {
        if (_status != LauncherStatus.Started)
        {
            PopupMessage.Warning("请先启动 QuickerRpc（Launcher.Start）。");
            return;
        }

        GetService<QuickerRpcMonitorWindowService>().Toggle();
    }

    private static void ShowMonitorCore() =>
        GetService<QuickerRpcMonitorWindowService>().Show();

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

            StopCore();

            var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";
            PopupMessage.Infomation("动作已退出，版本号:" + version);
        }
    }

    /// <summary>
    /// Exits other QuickerRpc.Plugin.* assemblies while pumping the WPF dispatcher.
    /// </summary>
    private static void WaitForPriorQuickerRpcExitWithUiPump()
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || !dispatcher.CheckAccess())
        {
            Task.Run(ProgramManager.ExitOtherVersionPlugins).GetAwaiter().GetResult();
            return;
        }

        var frame = new DispatcherFrame();
        _ = Task.Run(() =>
        {
            try
            {
                ProgramManager.ExitOtherVersionPlugins();
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex, "ExitOtherVersionPlugins failed (ignored).");
            }
            finally
            {
                frame.Continue = false;
            }
        });
        Dispatcher.PushFrame(frame);
    }

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
