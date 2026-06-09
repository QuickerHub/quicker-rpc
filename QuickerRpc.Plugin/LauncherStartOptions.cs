using System;
using Quicker.Domain.Actions.Runtime;
using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>
/// Options resolved for <see cref="Launcher.Start"/>.
/// Exposed to Quicker expressions and subprograms (e.g. QuickerRpc_Run).
/// </summary>
public sealed class LauncherStartOptions
{
    /// <summary>
    /// When true, force-terminates QuickerAgent (<c>quicker-agent.exe</c>) and skips RPC start side-effects.
    /// </summary>
    public bool KillQuickerAgent { get; set; }

    /// <summary>
    /// When true, starts the installed QuickerAgent desktop app (<c>quicker-agent.exe</c>) after RPC is ready.
    /// </summary>
    public bool LaunchQuickerAgent { get; set; }

    /// <summary>
    /// Suppress success/warning popups and skip QuickerAgent update check (for qkrpc bootstrap / remote start).
    /// </summary>
    public bool Silent { get; set; }

    /// <summary>
    /// Show plugin version toast on start and when RPC is already running (e.g. <see cref="ActionTrigger.Extern"/>).
    /// </summary>
    public bool NotifyPluginVersion { get; set; }
}

/// <summary>
/// Parses <c>quicker_in_param</c> from <c>quicker:runaction</c> into <see cref="LauncherStartOptions"/>.
/// </summary>
public static class LauncherStartOptionsParser
{
    /// <summary>RPC only — used by qkrpc bootstrap (<c>quicker:runaction:…?plugin</c>).</summary>
    public const string ModePluginOnly = "plugin";

    /// <summary>Start RPC and launch QuickerAgent.</summary>
    public const string ModeAgent = "agent";

    /// <summary>Force-quit QuickerAgent desktop app (context menu / <c>quicker_in_param</c>).</summary>
    public const string ModeKillAgent = "agent-kill";

    public static bool IsKillAgentMode(string? quickerInParam) =>
        string.Equals(NormalizeMode(quickerInParam), ModeKillAgent, StringComparison.OrdinalIgnoreCase)
        || string.Equals(NormalizeMode(quickerInParam), "kill-agent", StringComparison.OrdinalIgnoreCase);

    public static LauncherStartOptions Parse(string? quickerInParam)
    {
        var mode = NormalizeMode(quickerInParam);
        if (IsKillAgentMode(mode))
        {
            return KillAgentOnly();
        }

        if (IsPluginOnlyMode(mode))
        {
            return PluginOnly();
        }

        if (IsAgentMode(mode))
        {
            return new LauncherStartOptions
            {
                LaunchQuickerAgent = true,
                Silent = false,
            };
        }

        // Manual run / tray click without param: open Agent UI.
        return new LauncherStartOptions
        {
            LaunchQuickerAgent = true,
            Silent = false,
        };
    }

    private static string NormalizeMode(string? quickerInParam)
    {
        var mode = (quickerInParam ?? string.Empty).Trim();
        if (mode.StartsWith("?", StringComparison.Ordinal))
        {
            mode = mode.Substring(1).Trim();
        }

        return mode;
    }

    public static LauncherStartOptions KillAgentOnly() =>
        new()
        {
            KillQuickerAgent = true,
            LaunchQuickerAgent = false,
            Silent = false,
        };

    /// <summary>
    /// True when <paramref name="quickerInParam"/> requests RPC-only bootstrap (e.g. <c>?plugin</c>).
    /// </summary>
    public static bool IsPluginOnlyParam(string? quickerInParam) =>
        IsPluginOnlyMode(NormalizeMode(quickerInParam));

    private static bool IsPluginOnlyMode(string mode) =>
        mode.Equals(ModePluginOnly, StringComparison.OrdinalIgnoreCase)
        || mode.Equals("rpc", StringComparison.OrdinalIgnoreCase)
        || mode.Equals("bootstrap", StringComparison.OrdinalIgnoreCase);

    private static bool IsAgentMode(string mode) =>
        mode.Equals(ModeAgent, StringComparison.OrdinalIgnoreCase)
        || mode.Equals("ui", StringComparison.OrdinalIgnoreCase);

    public static LauncherStartOptions PluginOnly() =>
        new()
        {
            LaunchQuickerAgent = false,
            Silent = true,
            NotifyPluginVersion = false,
        };

    /// <summary>RPC only with version toast (external / qkrpc invocation).</summary>
    public static LauncherStartOptions PluginOnlyWithVersionNotify() =>
        new()
        {
            LaunchQuickerAgent = false,
            Silent = true,
            NotifyPluginVersion = true,
        };
}

/// <summary>
/// Combines <see cref="IActionContext"/> trigger, <c>quicker_in_param</c>, and explicit options.
/// </summary>
public static class LauncherStartOptionsResolver
{
    public static LauncherStartOptions Resolve(IActionContext? context) =>
        Resolve(
            ActionExecuteContextProbe.TryGetActionTrigger(context),
            ActionExecuteContextProbe.TryGetQuickerInParam(context),
            invokedFromAction: context is not null);

    public static LauncherStartOptions Resolve(
        IActionContext? context,
        string? quickerInParam) =>
        Resolve(
            ActionExecuteContextProbe.TryGetActionTrigger(context),
            quickerInParam,
            invokedFromAction: context is not null);

    internal static LauncherStartOptions Resolve(
        ActionTrigger? actionTrigger,
        string? quickerInParam = null,
        bool invokedFromAction = false) =>
        Resolve((int?)actionTrigger, quickerInParam, invokedFromAction);

    internal static LauncherStartOptions Resolve(
        int? actionTrigger,
        string? quickerInParam = null,
        bool invokedFromAction = false)
    {
        if (actionTrigger == (int)ActionTrigger.Extern)
        {
            return LauncherStartOptionsParser.PluginOnlyWithVersionNotify();
        }

        if (actionTrigger == (int)ActionTrigger.AutoRun)
        {
            return LauncherStartOptionsParser.PluginOnly();
        }

        quickerInParam = SanitizeQuickerInParamForInteractiveTrigger(actionTrigger, quickerInParam);

        if (actionTrigger is not null || quickerInParam is not null)
        {
            return LauncherStartOptionsParser.Parse(quickerInParam);
        }

        return invokedFromAction
            ? LauncherStartOptionsParser.Parse(null)
            : LauncherStartOptionsParser.PluginOnly();
    }

    /// <summary>
    /// Panel / manual clicks should open QuickerAgent; ignore stale bootstrap <c>plugin</c> left in
    /// <c>quicker_in_param</c> from a prior <c>quicker:runaction:…?plugin</c> or variable chain.
    /// </summary>
    private static string? SanitizeQuickerInParamForInteractiveTrigger(
        int? actionTrigger,
        string? quickerInParam)
    {
        if (!IsInteractiveUserTrigger(actionTrigger))
        {
            return quickerInParam;
        }

        return LauncherStartOptionsParser.IsPluginOnlyParam(quickerInParam)
            ? null
            : quickerInParam;
    }

    private static bool IsInteractiveUserTrigger(int? actionTrigger) =>
        actionTrigger is not null
        && actionTrigger != (int)ActionTrigger.Extern
        && actionTrigger != (int)ActionTrigger.AutoRun;
}
