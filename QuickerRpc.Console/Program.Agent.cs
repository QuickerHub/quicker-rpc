using CommandLine;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunAgentFromArgsAsync(string[] args)
    {
        var setupArgs = new List<string>();
        for (var i = 1; i < args.Length; i++)
        {
            var token = args[i];
            if (i == 1
                && !token.StartsWith('-')
                && !string.Equals(token, "setup", StringComparison.OrdinalIgnoreCase))
            {
                global::System.Console.Error.WriteLine("Unknown agent command. Use: qkrpc agent setup");
                return ExitCodes.Error;
            }

            if (i == 1 && string.Equals(token, "setup", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            setupArgs.Add(token);
        }

        return await Parser.Default.ParseArguments<AgentSetupFlagsOptions>(setupArgs.ToArray())
            .MapResult(
                (AgentSetupFlagsOptions o) => QkrpcAgentSetup.RunAsync(QkrpcAgentSetupOptions.FromAgent(o)),
                _ => Task.FromResult(ExitCodes.Error))
            .ConfigureAwait(false);
    }
}

/// <summary>Flags for <c>qkrpc agent setup</c> (parsed after the agent/setup tokens).</summary>
public sealed class AgentSetupFlagsOptions
{
    [Option("check", HelpText = "Verify ~/.qkrpc/agent-setup.json matches CLI version.")]
    public bool Check { get; set; }

    [Option("upgrade", HelpText = "Refresh skills, rules, and Claude guidance only (skip MCP config).")]
    public bool Upgrade { get; set; }

    [Option("cursor", HelpText = "Write ~/.cursor/mcp.json (default when no agent flag).")]
    public bool Cursor { get; set; }

    [Option("claude", HelpText = "Write Claude Desktop config.")]
    public bool Claude { get; set; }

    [Option("vscode", HelpText = "Write VS Code / Copilot user mcp.json.")]
    public bool Vscode { get; set; }

    [Option("windsurf", HelpText = "Write ~/.codeium/windsurf/mcp_config.json.")]
    public bool Windsurf { get; set; }

    [Option("cline", HelpText = "Write Cline cline_mcp_settings.json.")]
    public bool Cline { get; set; }

    [Option("codex", HelpText = "Codex: codex mcp add + optional project AGENTS.md (--project).")]
    public bool Codex { get; set; }

    [Option("all", HelpText = "All supported user-level MCP configs.")]
    public bool All { get; set; }

    [Option("project", HelpText = "Also write project .cursor/.vscode/.mcp.json in cwd.")]
    public bool Project { get; set; }

    [Option("project-skills", HelpText = "With --project: also copy skills to .cursor/skills/.")]
    public bool ProjectSkills { get; set; }

    [Option("workspace", HelpText = "QKRPC_WORKSPACE_ROOT (default: current directory).")]
    public string? Workspace { get; set; }

    [Option("skill-source", HelpText = "Path to docs/skills root or a single skill directory.")]
    public string? SkillSource { get; set; }

    [Option("skip-skill", HelpText = "Do not copy skills.")]
    public bool SkipSkill { get; set; }

    [Option("json", HelpText = "Emit JSON to stdout (install result or --check report).")]
    public bool Json { get; set; }
}
