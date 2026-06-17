namespace QuickerRpc.Console.Mcp;

internal sealed class QkrpcAgentSetupOptions
{
    public bool Check { get; init; }
    public bool Upgrade { get; init; }

    public bool Interactive { get; init; }

    /// <summary>Legacy flag; ~/.cursor/mcp.json is no longer written.</summary>
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

    /// <summary>Install Cursor plugin (~/.cursor/plugins/local/quicker-rpc).</summary>
    public bool CursorPlugin { get; init; }

    /// <summary>Install Codex plugin (~/.agents/plugins/quicker-rpc).</summary>
    public bool CodexPlugin { get; init; }

    internal bool UsesCursorPlugin() => CursorPlugin;

    internal bool UsesCodexPlugin() => CodexPlugin;

    internal bool IsCursorPluginOnlyInstall() =>
        UsesCursorPlugin()
        && !UsesCodexPlugin()
        && !Claude
        && !Vscode
        && !Windsurf
        && !Cline
        && !All
        && !Project;

    internal bool IsCodexPluginOnlyInstall() =>
        UsesCodexPlugin()
        && !UsesCursorPlugin()
        && !Claude
        && !Vscode
        && !Windsurf
        && !Cline
        && !All
        && !Project;

    internal static QkrpcAgentSetupOptions FromMcp(McpOptions options) =>
        Build(
            check: options.Check,
            upgrade: options.Upgrade,
            interactive: options.Interactive,
            cursor: options.Cursor,
            claude: options.Claude,
            vscode: options.Vscode,
            windsurf: options.Windsurf,
            cline: options.Cline,
            codex: options.Codex,
            all: options.All,
            cursorPluginFlag: options.CursorPlugin,
            codexPluginFlag: options.CodexPlugin,
            project: options.Project,
            projectSkills: options.ProjectSkills,
            workspace: options.Workspace,
            skillSource: options.SkillSource,
            json: options.Json);

    internal static QkrpcAgentSetupOptions FromAgent(AgentSetupFlagsOptions options) =>
        Build(
            check: options.Check,
            upgrade: options.Upgrade,
            interactive: options.Interactive,
            cursor: options.Cursor,
            claude: options.Claude,
            vscode: options.Vscode,
            windsurf: options.Windsurf,
            cline: options.Cline,
            codex: options.Codex,
            all: options.All,
            cursorPluginFlag: options.CursorPlugin,
            codexPluginFlag: options.CodexPlugin,
            project: options.Project,
            projectSkills: options.ProjectSkills,
            workspace: options.Workspace,
            skillSource: options.SkillSource,
            json: options.Json);

    private static QkrpcAgentSetupOptions Build(
        bool check,
        bool upgrade,
        bool interactive,
        bool cursor,
        bool claude,
        bool vscode,
        bool windsurf,
        bool cline,
        bool codex,
        bool all,
        bool cursorPluginFlag,
        bool codexPluginFlag,
        bool project,
        bool projectSkills,
        string? workspace,
        string? skillSource,
        bool json)
    {
        var defaultNoHostFlags =
            !cursor
            && !claude
            && !vscode
            && !windsurf
            && !cline
            && !codex
            && !all
            && !cursorPluginFlag
            && !codexPluginFlag;

        var cursorPlugin = cursorPluginFlag || cursor || all || defaultNoHostFlags;
        var codexPlugin = codexPluginFlag || codex || all;

        return new QkrpcAgentSetupOptions
        {
            Check = check,
            Upgrade = upgrade,
            Interactive = interactive,
            Cursor = false,
            Claude = claude,
            Vscode = vscode,
            Windsurf = windsurf,
            Cline = cline,
            Codex = codex,
            All = all,
            Project = project,
            ProjectSkills = projectSkills,
            Workspace = workspace,
            SkillSource = skillSource,
            SkipSkill = true,
            Json = json,
            CursorPlugin = cursorPlugin,
            CodexPlugin = codexPlugin,
        };
    }
}
