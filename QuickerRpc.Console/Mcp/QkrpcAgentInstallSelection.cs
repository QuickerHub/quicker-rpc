namespace QuickerRpc.Console.Mcp;

/// <summary>User choices from <c>qkrpc agent install</c> interactive wizard.</summary>
internal sealed class QkrpcAgentInstallSelection
{
    public bool Cursor { get; init; }
    public bool Codex { get; init; }
    public bool Claude { get; init; }
    public bool Vscode { get; init; }
    public bool Windsurf { get; init; }
    public bool Cline { get; init; }
    public bool AllHosts { get; init; }
    public bool InstallSkills { get; init; }
    public bool CursorPlugin { get; init; }
    public bool CodexPlugin { get; init; }
    public bool ProjectMcp { get; init; }
    public bool ProjectSkills { get; init; }
    public string? Workspace { get; init; }

    internal QkrpcAgentSetupOptions ToSetupOptions()
    {
        var cursorPlugin = CursorPlugin || Cursor || AllHosts;
        var codexPlugin = CodexPlugin || Codex || AllHosts;
        return new QkrpcAgentSetupOptions
        {
            Cursor = false,
            Claude = AllHosts || Claude,
            Vscode = AllHosts || Vscode,
            Windsurf = AllHosts || Windsurf,
            Cline = AllHosts || Cline,
            Codex = Codex || AllHosts,
            All = AllHosts,
            Project = ProjectMcp,
            ProjectSkills = ProjectSkills,
            Workspace = Workspace,
            SkipSkill = true,
            CursorPlugin = cursorPlugin,
            CodexPlugin = codexPlugin,
        };
    }

    internal static QkrpcAgentInstallSelection ParseChoices(
        string? hostsInput,
        bool installSkills,
        bool cursorPlugin,
        bool projectMcp,
        bool projectSkills,
        string? workspace)
    {
        var input = hostsInput?.Trim() ?? string.Empty;
        var cursor = false;
        var codex = false;
        var claude = false;
        var vscode = false;
        var windsurf = false;
        var cline = false;
        var allHosts = false;

        if (string.IsNullOrWhiteSpace(input))
        {
            cursor = true;
        }
        else if (string.Equals(input, "7", StringComparison.Ordinal) || string.Equals(input, "all", StringComparison.OrdinalIgnoreCase))
        {
            allHosts = true;
        }
        else
        {
            foreach (var part in input.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                switch (part)
                {
                    case "1":
                        cursor = true;
                        break;
                    case "2":
                        codex = true;
                        break;
                    case "3":
                        claude = true;
                        break;
                    case "4":
                        vscode = true;
                        break;
                    case "5":
                        windsurf = true;
                        break;
                    case "6":
                        cline = true;
                        break;
                    case "7":
                        allHosts = true;
                        break;
                    default:
                        throw new FormatException($"Unknown host choice: {part}");
                }
            }
        }

        return new QkrpcAgentInstallSelection
        {
            Cursor = cursor,
            Codex = codex,
            Claude = claude,
            Vscode = vscode,
            Windsurf = windsurf,
            Cline = cline,
            AllHosts = allHosts,
            InstallSkills = installSkills,
            CursorPlugin = cursorPlugin,
            ProjectMcp = projectMcp,
            ProjectSkills = projectSkills,
            Workspace = workspace,
        };
    }
}
