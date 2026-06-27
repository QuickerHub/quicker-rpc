namespace QuickerRpc.Plugin.V2;

/// <summary>Static entry for Quicker V2 host integration (QExpr / DI bootstrap).</summary>
public static class Runner
{
    public static void StartRpcServer() => Launcher.Start();

    public static LauncherStatus GetStatus() => Launcher.Status;
}
