namespace QuickerRpc.Console.Mcp;

/// <summary>Backward-compatible alias for <see cref="QkrpcAgentSetup"/> (qkrpc mcp install).</summary>
internal static class QkrpcMcpInstaller
{
    internal static async Task<int> RunAsync(McpOptions options)
    {
        if (QkrpcAgentSetupInteractive.ShouldUseInteractiveWizard(
            new AgentSetupFlagsOptions
            {
                Interactive = options.Interactive,
                Cursor = options.Cursor,
                Claude = options.Claude,
                Vscode = options.Vscode,
                Windsurf = options.Windsurf,
                Cline = options.Cline,
                Codex = options.Codex,
                All = options.All,
                Check = options.Check,
                Upgrade = options.Upgrade,
            }))
        {
            return await QkrpcAgentSetupInteractive.RunAsync().ConfigureAwait(false);
        }

        return await QkrpcAgentSetup.RunAsync(QkrpcAgentSetupOptions.FromMcp(options)).ConfigureAwait(false);
    }
}
