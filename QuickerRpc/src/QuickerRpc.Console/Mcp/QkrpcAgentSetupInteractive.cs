namespace QuickerRpc.Console.Mcp;

internal static class QkrpcAgentSetupInteractive
{
    internal static async Task<int> RunAsync()
    {
        if (!CanRunInteractive())
        {
            global::System.Console.Error.WriteLine(
                "Interactive installer requires a TTY. Use flags instead, e.g.:");
            global::System.Console.Error.WriteLine("  qkrpc agent setup");
            global::System.Console.Error.WriteLine("  qkrpc agent setup --codex --project");
            global::System.Console.Error.WriteLine("  qkrpc agent setup --all");
            return ExitCodes.Error;
        }

        WriteBanner();
        var selection = PromptSelection();
        var options = selection.ToSetupOptions();

        WriteSummary(selection);
        if (!PromptYesNo("开始安装? [Y/n]", defaultYes: true))
        {
            global::System.Console.Error.WriteLine("已取消。");
            return ExitCodes.Success;
        }

        return await QkrpcAgentSetup.RunAsync(options).ConfigureAwait(false);
    }

    internal static bool ShouldUseInteractiveWizard(AgentSetupFlagsOptions flags)
    {
        if (!flags.Interactive)
        {
            return false;
        }

        return !flags.Cursor
            && !flags.Claude
            && !flags.Vscode
            && !flags.Windsurf
            && !flags.Cline
            && !flags.Codex
            && !flags.All
            && !flags.CursorPlugin
            && !flags.Check
            && !flags.Upgrade;
    }

    private static bool CanRunInteractive()
    {
        try
        {
            return Environment.UserInteractive && !global::System.Console.IsInputRedirected;
        }
        catch
        {
            return false;
        }
    }

    private static void WriteBanner()
    {
        global::System.Console.Error.WriteLine();
        global::System.Console.Error.WriteLine("  qkrpc Agent 安装向导");
        global::System.Console.Error.WriteLine("  ====================");
        global::System.Console.Error.WriteLine();
        global::System.Console.Error.WriteLine("  为 AI 编程助手安装 qkrpc（Cursor 默认项目级 MCP，避免污染其它仓库）。");
        global::System.Console.Error.WriteLine("  前置: Quicker 已运行且已加载 QuickerRpc 插件。");
        global::System.Console.Error.WriteLine();
    }

    private static QkrpcAgentInstallSelection PromptSelection()
    {
        global::System.Console.Error.WriteLine("选择要配置的宿主（输入编号，逗号分隔，默认 1）:");
        global::System.Console.Error.WriteLine("  1) Cursor          — 项目 .cursor/mcp.json（推荐）");
        global::System.Console.Error.WriteLine("  2) Codex           — 本地插件 (MCP + skills)");
        global::System.Console.Error.WriteLine("  3) Claude Desktop  — claude_desktop_config.json");
        global::System.Console.Error.WriteLine("  4) VS Code Copilot — 用户 mcp.json");
        global::System.Console.Error.WriteLine("  5) Windsurf        — mcp_config.json");
        global::System.Console.Error.WriteLine("  6) Cline           — cline_mcp_settings.json");
        global::System.Console.Error.WriteLine("  7) 全部用户级 MCP（不含 Cursor 全局）");
        global::System.Console.Error.WriteLine();

        var hostsInput = PromptLine("宿主 [1]", "1");

        QkrpcAgentInstallSelection selection;
        try
        {
            selection = QkrpcAgentInstallSelection.ParseChoices(
                hostsInput,
                installSkills: false,
                cursorPlugin: false,
                projectMcp: false,
                projectSkills: false,
                workspace: null);
        }
        catch (FormatException ex)
        {
            global::System.Console.Error.WriteLine(ex.Message);
            global::System.Console.Error.WriteLine("使用默认: Cursor 项目级 MCP");
            selection = QkrpcAgentInstallSelection.ParseChoices("1", false, false, false, false, null);
        }

        var cursorSelected = selection.AllHosts || selection.Cursor;
        var cursorPlugin = false;
        var projectMcp = cursorSelected;
        if (cursorSelected)
        {
            cursorPlugin = PromptYesNo(
                "安装用户全局 Cursor 插件?（会干扰其它仓库，一般选 N）[y/N]",
                defaultYes: false);
            if (cursorPlugin)
            {
                projectMcp = PromptYesNo("同时写入项目 .cursor/mcp.json? [Y/n]", defaultYes: true);
            }
            else
            {
                projectMcp = true;
            }
        }
        else
        {
            projectMcp = PromptYesNo("写入当前目录 .cursor/mcp.json（项目级 MCP）? [y/N]", defaultYes: false);
        }

        var projectSkills = false;
        if (projectMcp)
        {
            projectSkills = PromptYesNo("同时复制 skills 到项目 .cursor/skills/? [y/N]", defaultYes: false);
        }

        global::System.Console.Error.WriteLine();
        global::System.Console.Error.WriteLine("工作区根目录 (QKRPC_WORKSPACE_ROOT):");
        if (projectMcp)
        {
            global::System.Console.Error.WriteLine("  1) 固定为当前目录（推荐，避免其它仓库误用）");
            global::System.Console.Error.WriteLine("  2) 跟随编辑器打开的项目 ${workspaceFolder}");
            global::System.Console.Error.WriteLine("  3) 自定义路径");
            var workspaceChoice = PromptLine("选择 [1]", "1");
            string? workspace = null;
            switch (workspaceChoice.Trim())
            {
                case "1":
                case "":
                    workspace = Directory.GetCurrentDirectory();
                    break;
                case "2":
                    workspace = null;
                    break;
                case "3":
                    workspace = PromptLine("路径", Directory.GetCurrentDirectory());
                    break;
                default:
                    global::System.Console.Error.WriteLine("无效选择，使用当前目录。");
                    workspace = Directory.GetCurrentDirectory();
                    break;
            }

            return QkrpcAgentInstallSelection.ParseChoices(
                hostsInput,
                installSkills: false,
                cursorPlugin,
                projectMcp,
                projectSkills,
                workspace);
        }

        global::System.Console.Error.WriteLine("  1) 跟随编辑器打开的项目 ${workspaceFolder}（推荐）");
        global::System.Console.Error.WriteLine("  2) 固定为当前目录");
        global::System.Console.Error.WriteLine("  3) 自定义路径");
        var workspaceChoiceLegacy = PromptLine("选择 [1]", "1");
        string? workspaceLegacy = null;
        switch (workspaceChoiceLegacy.Trim())
        {
            case "1":
            case "":
                workspaceLegacy = null;
                break;
            case "2":
                workspaceLegacy = Directory.GetCurrentDirectory();
                break;
            case "3":
                workspaceLegacy = PromptLine("路径", Directory.GetCurrentDirectory());
                break;
            default:
                global::System.Console.Error.WriteLine("无效选择，使用跟随编辑器。");
                workspaceLegacy = null;
                break;
        }

        return QkrpcAgentInstallSelection.ParseChoices(
            hostsInput,
            installSkills: false,
            cursorPlugin,
            projectMcp,
            projectSkills,
            workspaceLegacy);
    }

    private static void WriteSummary(QkrpcAgentInstallSelection selection)
    {
        global::System.Console.Error.WriteLine();
        global::System.Console.Error.WriteLine("将安装:");
        if (selection.AllHosts)
        {
            global::System.Console.Error.WriteLine("  • 全部用户级 MCP 宿主（Cursor 除外）");
        }
        else
        {
            if (selection.Cursor)
            {
                global::System.Console.Error.WriteLine("  • Cursor");
            }
            if (selection.Codex)
            {
                global::System.Console.Error.WriteLine("  • Codex");
            }
            if (selection.Claude)
            {
                global::System.Console.Error.WriteLine("  • Claude Desktop");
            }
            if (selection.Vscode)
            {
                global::System.Console.Error.WriteLine("  • VS Code Copilot");
            }
            if (selection.Windsurf)
            {
                global::System.Console.Error.WriteLine("  • Windsurf");
            }
            if (selection.Cline)
            {
                global::System.Console.Error.WriteLine("  • Cline");
            }
        }

        if (selection.CursorPlugin)
        {
            global::System.Console.Error.WriteLine("  • Cursor 用户全局本地插件（影响所有仓库）");
        }
        if (selection.CodexPlugin || selection.Codex || selection.AllHosts)
        {
            global::System.Console.Error.WriteLine("  • Codex 本地插件包");
        }
        if (selection.ProjectMcp || (selection.Cursor && !selection.CursorPlugin))
        {
            global::System.Console.Error.WriteLine("  • 项目级 .cursor/mcp.json + rules");
        }
        if (selection.ProjectSkills)
        {
            global::System.Console.Error.WriteLine("  • 项目级 skills");
        }

        if (string.IsNullOrWhiteSpace(selection.Workspace))
        {
            global::System.Console.Error.WriteLine("  • 工作区: 跟随 ${workspaceFolder}");
        }
        else
        {
            global::System.Console.Error.WriteLine($"  • 工作区: {Path.GetFullPath(selection.Workspace)}");
        }

        global::System.Console.Error.WriteLine();
    }

    private static string PromptLine(string label, string defaultValue)
    {
        global::System.Console.Error.Write($"{label}: ");
        var line = global::System.Console.ReadLine()?.Trim();
        return string.IsNullOrWhiteSpace(line) ? defaultValue : line;
    }

    private static bool PromptYesNo(string label, bool defaultYes)
    {
        global::System.Console.Error.Write($"{label}: ");
        var line = global::System.Console.ReadLine()?.Trim();
        if (string.IsNullOrWhiteSpace(line))
        {
            return defaultYes;
        }

        if (line.Equals("y", StringComparison.OrdinalIgnoreCase)
            || line.Equals("yes", StringComparison.OrdinalIgnoreCase)
            || line.Equals("是", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (line.Equals("n", StringComparison.OrdinalIgnoreCase)
            || line.Equals("no", StringComparison.OrdinalIgnoreCase)
            || line.Equals("否", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return defaultYes;
    }
}
