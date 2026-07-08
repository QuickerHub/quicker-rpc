using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>
/// Quicker plugin composition root: DI host + named-pipe RPC <see cref="Rpc.QuickerRpcServer"/>.
/// </summary>
public static partial class Launcher
{
    /// <summary>
    /// Starts the RPC host without blocking the caller or UI thread.
    /// Behavior is resolved from the root action's <see cref="ActionExecuteContext.ActionTrigger"/>
    /// and <see cref="ActionExecuteContext.InputParam"/> (via <see cref="ActionExecuteContext.RootContext"/> in subprograms).
    /// </summary>
    public static void Start(IActionContext? context = null) =>
        StartCore(LauncherStartOptionsResolver.Resolve(context));

    /// <summary>
    /// Same as <see cref="Start"/> but accepts an explicit <c>quicker_in_param</c> (e.g. context-menu data).
    /// </summary>
    public static void StartFromQuickerInParam(string? quickerInParam, IActionContext? context = null) =>
        StartCore(LauncherStartOptionsResolver.Resolve(context, quickerInParam));

    /// <summary>
    /// Starts RPC only (no QuickerAgent UI), honoring interactive panel clicks.
    /// Use for dedicated standalone qkrpc actions; do not rely on <c>quicker_in_param=plugin</c> on panel clicks.
    /// </summary>
    public static void StartPluginOnly(IActionContext? context = null, bool notifyVersion = false) =>
        StartCore(
            notifyVersion
                ? LauncherStartOptionsParser.PluginOnlyWithVersionNotify()
                : LauncherStartOptionsParser.PluginOnly());

    /// <summary>
    /// Starts RPC and opens QuickerAgent, honoring interactive panel clicks.
    /// </summary>
    public static void StartWithQuickerAgent(IActionContext? context = null) =>
        StartCore(new LauncherStartOptions
        {
            LaunchQuickerAgent = true,
            Silent = false,
        });
}
