namespace QuickerRpc.Console.Mcp;

internal sealed class QkrpcAgentSetupOptions
{
    public bool Check { get; init; }
    public bool Upgrade { get; init; }

    public bool Cursor { get; init; }
    public bool Claude { get; init; }
    public bool Vscode { get; init; }
    public bool Windsurf { get; init; }
    public bool Cline { get; init; }
    public bool Codex { get; init; }
    public bool All { get; init; }
    public bool Project { get; init; }
    public bool ProjectSkills { get; init; }
    public string? Workspace { get; init; }
    public string? SkillSource { get; init; }
    public bool SkipSkill { get; init; }
    public bool Json { get; init; }

    internal static QkrpcAgentSetupOptions FromMcp(McpOptions options) => new()
    {
        Check = options.Check,
        Upgrade = options.Upgrade,
        Cursor = options.Cursor,
        Claude = options.Claude,
        Vscode = options.Vscode,
        Windsurf = options.Windsurf,
        Cline = options.Cline,
        Codex = options.Codex,
        All = options.All,
        Project = options.Project,
        ProjectSkills = options.ProjectSkills,
        Workspace = options.Workspace,
        SkillSource = options.SkillSource,
        SkipSkill = options.SkipSkill,
        Json = options.Json,
    };

    internal static QkrpcAgentSetupOptions FromAgent(AgentSetupFlagsOptions options) => new()
    {
        Check = options.Check,
        Upgrade = options.Upgrade,
        Cursor = options.Cursor,
        Claude = options.Claude,
        Vscode = options.Vscode,
        Windsurf = options.Windsurf,
        Cline = options.Cline,
        Codex = options.Codex,
        All = options.All,
        Project = options.Project,
        ProjectSkills = options.ProjectSkills,
        Workspace = options.Workspace,
        SkillSource = options.SkillSource,
        SkipSkill = options.SkipSkill,
        Json = options.Json,
    };
}
