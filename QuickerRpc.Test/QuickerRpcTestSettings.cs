using System;

namespace QuickerRpc.Test;

/// <summary>Environment-driven settings for live RPC integration tests.</summary>
internal static class QuickerRpcTestSettings
{
    public static int ConnectTimeoutSeconds =>
        int.TryParse(Environment.GetEnvironmentVariable("QUICKER_RPC_CONNECT_TIMEOUT"), out var seconds) && seconds > 0
            ? seconds
            : 20;

    public static bool TryBootstrap =>
        !string.Equals(
            Environment.GetEnvironmentVariable("QUICKER_RPC_NO_BOOTSTRAP"),
            "1",
            StringComparison.OrdinalIgnoreCase);

    /// <summary>Fixed local fixture action title (see <c>QuickerRpcRpcTestAction</c>).</summary>
    public const string RpcTestActionTitle = "_rpc_test";

    /// <summary>Local XAction id override; default uses auto-managed <see cref="RpcTestActionTitle"/>.</summary>
    public static string? TestActionId =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_ACTION_ID"));

    /// <summary>Installed shared action id (default: QuickerRpc share action).</summary>
    public static string? SharedActionId =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_SHARED_ACTION_ID"))
        ?? "f5c76108-3ce9-433f-8cd0-8f0d9c562052";

    /// <summary>Regression fixture: local button linked to action-store template (empty in-profile <c>Data</c>).</summary>
    public const string ClipboardN10ActionTitle = "剪贴板 n10";

    /// <summary>Default id for <see cref="ClipboardN10ActionTitle"/> on the maintainer profile.</summary>
    public const string ClipboardN10ActionIdDefault = "32c12786-9bb8-4b0c-8d55-7e6a4c8a5d10";

    public static string ClipboardN10ActionId =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_CLIPBOARD_N10_ACTION_ID"))
        ?? ClipboardN10ActionIdDefault;

    public static string? SubProgramIdOrName =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_SUBPROGRAM"));

    public static string SearchQuery =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_SEARCH_QUERY"))
        ?? "QuickerRpc";

    public static string StepRunnerKey =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_STEP_RUNNER_KEY"))
        ?? "sys:MsgBox";

    public static string ActionListQuery =>
        NullIfEmpty(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_ACTION_LIST_QUERY"))
        ?? "QuickerRpc";

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
