using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>Optional alias; QuickerRpc_Run uses <see cref="Launcher.Start"/> like V1.</summary>
public static class Runner
{
    public static void StartRpcServer(IActionContext? context = null) => Launcher.Start(context);

    public static LauncherStatus GetStatus() => Launcher.Status;
}
