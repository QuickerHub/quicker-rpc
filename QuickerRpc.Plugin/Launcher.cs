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
}
