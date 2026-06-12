using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Services;
using Z.Expressions;

namespace QuickerRpc.Plugin;

public static partial class Launcher
{
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
        Start();
        return true;
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

    private static void StopCore()
    {
        if (_status != LauncherStatus.Started)
        {
            return;
        }

        try
        {
            ServiceHost.StopAsync().GetAwaiter().GetResult();
            _status = LauncherStatus.Stopped;
            Logger.LogInformation("QuickerRpc launcher stopped");
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Error stopping QuickerRpc services");
        }
    }
}
