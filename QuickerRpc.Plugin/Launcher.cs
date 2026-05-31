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

    public static void Start()
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                Logger.LogInformation("QuickerRpc launcher already started");
                PopupMessage.Success("动作已在运行");
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
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "QuickerRpc launcher start failed");
                PopupMessage.Warning(ex.Message);
                throw;
            }
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
