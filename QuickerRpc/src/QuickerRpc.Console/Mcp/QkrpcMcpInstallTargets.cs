namespace QuickerRpc.Console.Mcp;

internal enum McpConfigFormat
{
    /// <summary>Root key <c>mcpServers</c> — Cursor, Claude Desktop, Windsurf, Cline, Claude Code project.</summary>
    McpServers,

    /// <summary>Root key <c>servers</c> with <c>type: stdio</c> — VS Code Copilot MCP.</summary>
    VsCodeServers,
}

internal sealed record McpInstallTarget(string Id, string DisplayName, McpConfigFormat Format, Func<string> ResolveConfigPath)
{
    public static McpInstallTarget Cursor { get; } = new(
        "cursor",
        "Cursor (user)",
        McpConfigFormat.McpServers,
        () => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "mcp.json"));

    public static McpInstallTarget ClaudeDesktop { get; } = new(
        "claude",
        "Claude Desktop",
        McpConfigFormat.McpServers,
        () => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Claude",
            "claude_desktop_config.json"));

    public static McpInstallTarget VscodeUser { get; } = new(
        "vscode",
        "VS Code / Copilot (user)",
        McpConfigFormat.VsCodeServers,
        () => ResolveAppDataSubPath("Code", "User", "mcp.json"));

    public static McpInstallTarget Windsurf { get; } = new(
        "windsurf",
        "Windsurf Cascade",
        McpConfigFormat.McpServers,
        () => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codeium",
            "windsurf",
            "mcp_config.json"));

    public static McpInstallTarget Cline { get; } = new(
        "cline",
        "Cline (VS Code extension)",
        McpConfigFormat.McpServers,
        () => ResolveAppDataSubPath(
            "Code",
            "User",
            "globalStorage",
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json"));

    public static McpInstallTarget CursorProject(string workspaceRoot) => new(
        "cursor-project",
        "Cursor (project .cursor/mcp.json)",
        McpConfigFormat.McpServers,
        () => Path.Combine(workspaceRoot, ".cursor", "mcp.json"));

    public static McpInstallTarget VscodeProject(string workspaceRoot) => new(
        "vscode-project",
        "VS Code (project .vscode/mcp.json)",
        McpConfigFormat.VsCodeServers,
        () => Path.Combine(workspaceRoot, ".vscode", "mcp.json"));

    public static McpInstallTarget ClaudeCodeProject(string workspaceRoot) => new(
        "claude-code-project",
        "Claude Code (project .mcp.json)",
        McpConfigFormat.McpServers,
        () => Path.Combine(workspaceRoot, ".mcp.json"));

    public static IReadOnlyList<McpInstallTarget> AllUserTargets { get; } =
    [
        Cursor,
        ClaudeDesktop,
        VscodeUser,
        Windsurf,
        Cline,
    ];

    public static IReadOnlyList<(string Id, string DisplayName)> AllProjectTargetIds { get; } =
    [
        ("cursor-project", "Cursor (project .cursor/mcp.json)"),
        ("vscode-project", "VS Code (project .vscode/mcp.json)"),
        ("claude-code-project", "Claude Code (project .mcp.json)"),
    ];

    public static IEnumerable<McpInstallTarget> ProjectTargets(string workspaceRoot)
    {
        yield return CursorProject(workspaceRoot);
        yield return VscodeProject(workspaceRoot);
        yield return ClaudeCodeProject(workspaceRoot);
    }

    private static string ResolveAppDataSubPath(params string[] segments)
    {
        if (OperatingSystem.IsMacOS())
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return Path.Combine([home, "Library", "Application Support", .. segments]);
        }

        if (OperatingSystem.IsLinux())
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return Path.Combine([home, ".config", .. segments]);
        }

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine([appData, .. segments]);
    }
}
