using System;
using Quicker.Domain.Actions.Runtime;
using Quicker.Public.Interfaces;

namespace QuickerRpc.Plugin;

/// <summary>
/// Options for <see cref="Launcher.Start(LauncherStartOptions?)"/>.
/// Exposed to Quicker expressions and subprograms (e.g. QuickerRpc_Run).
/// </summary>
public sealed class LauncherStartOptions
{
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

    public static LauncherStartOptions Parse(string? quickerInParam)
    {
        var mode = (quickerInParam ?? string.Empty).Trim();
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
    public static LauncherStartOptions Resolve(
        IActionContext? context,
        string? quickerInParam = null,
        LauncherStartOptions? explicitOptions = null) =>
        Resolve(
            ActionExecuteContextProbe.TryGetActionTrigger(context),
            quickerInParam,
            explicitOptions);

    internal static LauncherStartOptions Resolve(
        ActionTrigger? actionTrigger,
        string? quickerInParam = null,
        LauncherStartOptions? explicitOptions = null) =>
        Resolve((int?)actionTrigger, quickerInParam, explicitOptions);

    internal static LauncherStartOptions Resolve(
        int? actionTrigger,
        string? quickerInParam = null,
        LauncherStartOptions? explicitOptions = null)
    {
        if (actionTrigger == (int)ActionTrigger.Extern)
        {
            return LauncherStartOptionsParser.PluginOnlyWithVersionNotify();
        }

        if (actionTrigger == (int)ActionTrigger.AutoRun)
        {
            return LauncherStartOptionsParser.PluginOnly();
        }

        if (explicitOptions is not null)
        {
            return explicitOptions;
        }

        if (actionTrigger is not null || quickerInParam is not null)
        {
            return LauncherStartOptionsParser.Parse(quickerInParam);
        }

        return new LauncherStartOptions();
    }
}
