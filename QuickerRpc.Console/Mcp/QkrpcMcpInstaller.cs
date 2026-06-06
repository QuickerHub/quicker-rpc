using System.Text.Json;
using System.Text.Json.Nodes;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpInstaller
{
    private const string ServerName = "qkrpc";

    internal static async Task<int> RunAsync(McpOptions options)
    {
        try
        {
            var qkrpcExe = ResolveQkrpcExecutable();
            var workspace = ResolveWorkspace(options);
            var targets = ResolveInstallTargets(options);
            var results = new List<string>();

            foreach (var target in targets)
            {
                var configPath = GetConfigPath(target);
                MergeMcpConfig(configPath, qkrpcExe, workspace);
                results.Add($"{target}: {configPath}");
            }

            if (options.Project)
            {
                var projectPath = Path.Combine(Directory.GetCurrentDirectory(), ".cursor", "mcp.json");
                MergeMcpConfig(projectPath, qkrpcExe, workspace);
                results.Add($"project: {projectPath}");
            }

            if (!options.SkipSkill)
            {
                var skillResult = TryInstallSkill(options.SkillSource);
                results.Add(skillResult);
            }

            BootstrapWorkspace(workspace);

            global::System.Console.Error.WriteLine("qkrpc MCP install completed:");
            foreach (var line in results)
            {
                global::System.Console.Error.WriteLine("  " + line);
            }

            global::System.Console.Error.WriteLine();
            global::System.Console.Error.WriteLine($"QKRPC_WORKSPACE_ROOT={workspace}");
            global::System.Console.Error.WriteLine($"Workspace files: {QkrpcMcpWorkspaceReadme.RelativePath}, {QkrpcMcpWorkspaceIndex.RelativePath}");
            global::System.Console.Error.WriteLine("Edit data.json/files with your editor; use qkrpc_sync push to save to Quicker.");
            global::System.Console.Error.WriteLine("Restart Cursor / Claude Desktop to load MCP servers.");

            await Task.CompletedTask.ConfigureAwait(false);
            return ExitCodes.Success;
        }
        catch (Exception ex)
        {
            global::System.Console.Error.WriteLine("qkrpc MCP install failed: " + ex.Message);
            return ExitCodes.Error;
        }
    }

    private static string ResolveQkrpcExecutable()
    {
        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(processPath) && File.Exists(processPath))
        {
            return Path.GetFullPath(processPath);
        }

        var onPath = FindOnPath("qkrpc.exe") ?? FindOnPath("qkrpc");
        if (!string.IsNullOrWhiteSpace(onPath))
        {
            return onPath;
        }

        throw new InvalidOperationException("Cannot resolve qkrpc executable path.");
    }

    private static string? FindOnPath(string fileName)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathEnv))
        {
            return null;
        }

        foreach (var segment in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(segment.Trim(), fileName);
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(candidate);
            }
        }

        return null;
    }

    private static string ResolveWorkspace(McpOptions options)
    {
        var configured = options.Workspace?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured);
        }

        return Path.GetFullPath(Directory.GetCurrentDirectory());
    }

    private static IEnumerable<string> ResolveInstallTargets(McpOptions options)
    {
        if (options.Cursor || options.Claude)
        {
            if (options.Cursor)
            {
                yield return "cursor";
            }

            if (options.Claude)
            {
                yield return "claude";
            }

            yield break;
        }

        yield return "cursor";
    }

    private static string GetConfigPath(string target) =>
        target switch
        {
            "claude" => Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Claude",
                "claude_desktop_config.json"),
            _ => Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".cursor",
                "mcp.json"),
        };

    private static void MergeMcpConfig(string configPath, string qkrpcExe, string workspaceRoot)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);

        JsonObject root;
        if (File.Exists(configPath))
        {
            var text = File.ReadAllText(configPath, System.Text.Encoding.UTF8);
            root = JsonNode.Parse(text)?.AsObject() ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        var servers = root["mcpServers"] as JsonObject ?? new JsonObject();
        servers[ServerName] = new JsonObject
        {
            ["command"] = qkrpcExe,
            ["args"] = new JsonArray("mcp"),
            ["env"] = new JsonObject
            {
                ["QKRPC_WORKSPACE_ROOT"] = workspaceRoot,
            },
        };
        root["mcpServers"] = servers;

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(configPath, json + Environment.NewLine, System.Text.Encoding.UTF8);
    }

    private static string TryInstallSkill(string? skillSource)
    {
        var source = ResolveSkillSource(skillSource);
        if (source is null)
        {
            return "skill: skipped (source not found; use --skill-source or clone quicker-rpc repo)";
        }

        var dest = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "skills",
            "quicker-authoring");

        CopyDirectory(source, dest);
        return $"skill: {dest}";
    }

    private static string? ResolveSkillSource(string? explicitSource)
    {
        if (!string.IsNullOrWhiteSpace(explicitSource))
        {
            var path = Path.GetFullPath(explicitSource.Trim());
            return Directory.Exists(path) ? path : null;
        }

        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            var candidate = Path.Combine(dir, "docs", "skills", "quicker-authoring");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "SKILL.md")))
            {
                return candidate;
            }
        }

        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(exeDir))
        {
            var sibling = Path.GetFullPath(Path.Combine(exeDir, "..", "..", "..", "docs", "skills", "quicker-authoring"));
            if (Directory.Exists(sibling))
            {
                return sibling;
            }
        }

        return null;
    }

    private static void BootstrapWorkspace(string workspaceRoot)
    {
        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
    }

    private static void CopyDirectory(string sourceDir, string destDir)
    {
        if (Directory.Exists(destDir))
        {
            Directory.Delete(destDir, recursive: true);
        }

        Directory.CreateDirectory(destDir);
        foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, file);
            var target = Path.Combine(destDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, overwrite: true);
        }
    }
}
