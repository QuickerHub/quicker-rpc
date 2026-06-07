namespace QuickerRpc.Console.Mcp;

/// <summary>Backward-compatible alias for <see cref="QkrpcAgentSetup"/> (qkrpc mcp install).</summary>
internal static class QkrpcMcpInstaller
{
    internal static Task<int> RunAsync(McpOptions options) =>
        QkrpcAgentSetup.RunAsync(QkrpcAgentSetupOptions.FromMcp(options));
}
