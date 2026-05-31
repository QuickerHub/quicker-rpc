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

    /// <summary>Local XAction id for get/patch tests (e.g. aaabbbccc).</summary>
    public static string? TestActionId =>
        string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_ACTION_ID"))
            ? null
            : Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_ACTION_ID")!.Trim();

    public static string SearchQuery =>
        string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_SEARCH_QUERY"))
            ? "aaabbb"
            : Environment.GetEnvironmentVariable("QUICKER_RPC_TEST_SEARCH_QUERY")!.Trim();
}
