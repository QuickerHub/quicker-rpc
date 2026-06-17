namespace QuickerRpc.Console.Mcp;

internal static class QkrpcCursorPluginInstaller
{
    private const string PluginLinkName = "quicker-rpc";

    internal static bool IsBundleAvailable() => ResolvePluginBundleSource() is not null;

    internal static IEnumerable<string> TryInstallPlugin()
    {
        var source = ResolvePluginBundleSource();
        if (source is null)
        {
            return new[]
            {
                "Cursor plugin: skipped (bundle not found — reinstall qkrpc from GitHub release)",
            };
        }

        var dest = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "plugins",
            "local",
            PluginLinkName);

        try
        {
            var localRoot = Path.GetDirectoryName(dest)!;
            Directory.CreateDirectory(localRoot);

            if (Directory.Exists(dest))
            {
                Directory.Delete(dest, recursive: true);
            }

            QkrpcAgentSetup.CopyDirectoryRecursive(source, dest);

            if (!File.Exists(Path.Combine(dest, ".cursor-plugin", "plugin.json")))
            {
                throw new InvalidOperationException("missing .cursor-plugin/plugin.json after copy");
            }

            return new[]
            {
                $"Cursor plugin: {dest}",
                "Plugin installed. Cursor reloads local plugins automatically; enable qkrpc in Settings → MCP if needed.",
            };
        }
        catch (Exception ex)
        {
            return new[]
            {
                $"Cursor plugin: failed ({ex.Message})",
                "Fallback: reinstall qkrpc from GitHub release and run qkrpc agent setup",
            };
        }
    }

    private static string? ResolvePluginBundleSource()
    {
        foreach (var candidate in EnumerateBundleCandidates())
        {
            if (File.Exists(Path.Combine(candidate, ".cursor-plugin", "plugin.json")))
            {
                return Path.GetFullPath(candidate);
            }
        }

        return TryAssembleFromBundledAssets();
    }

    private static IEnumerable<string> EnumerateBundleCandidates()
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(exeDir))
        {
            yield return Path.Combine(exeDir, "cursor-plugin");
            yield return Path.Combine(exeDir, "cursor-plugin", "quicker-rpc");
        }

        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            yield return Path.Combine(dir, "cursor-plugin", "quicker-rpc");
            yield return Path.Combine(dir, "cursor-plugin");
        }
    }

    /// <summary>Assemble a plugin tree from skills/ + agent-rules/ next to qkrpc.exe (release layout).</summary>
    private static string? TryAssembleFromBundledAssets()
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (string.IsNullOrWhiteSpace(exeDir))
        {
            return null;
        }

        var skillsRoot = Path.Combine(exeDir, "skills");
        var rulesFile = Path.Combine(exeDir, "agent-rules", "qkrpc.mdc");
        if (!Directory.Exists(skillsRoot) || !File.Exists(rulesFile))
        {
            return null;
        }

        var hasSkill = Directory.EnumerateDirectories(skillsRoot)
            .Any(d => File.Exists(Path.Combine(d, "SKILL.md")));
        if (!hasSkill)
        {
            return null;
        }

        var stage = Path.Combine(
            Path.GetTempPath(),
            "qkrpc-cursor-plugin-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(stage);
            Directory.CreateDirectory(Path.Combine(stage, ".cursor-plugin"));
            Directory.CreateDirectory(Path.Combine(stage, "rules"));
            Directory.CreateDirectory(Path.Combine(stage, "commands"));

            QkrpcAgentSetup.CopyDirectoryRecursive(skillsRoot, Path.Combine(stage, "skills"));
            File.Copy(rulesFile, Path.Combine(stage, "rules", "qkrpc.mdc"), overwrite: true);

            var mcpTemplate = Path.Combine(exeDir, "cursor-plugin", "mcp.json");
            if (File.Exists(mcpTemplate))
            {
                File.Copy(mcpTemplate, Path.Combine(stage, "mcp.json"), overwrite: true);
            }
            else
            {
                File.WriteAllText(
                    Path.Combine(stage, "mcp.json"),
                    """
                    {
                      "mcpServers": {
                        "qkrpc": {
                          "command": "qkrpc",
                          "args": ["mcp"],
                          "env": {
                            "QKRPC_WORKSPACE_ROOT": "${workspaceFolder}",
                            "QKRPC_CWD": "${workspaceFolder}"
                          }
                        }
                      }
                    }
                    """ + Environment.NewLine);
            }

            var manifestTemplate = Path.Combine(exeDir, "cursor-plugin", ".cursor-plugin", "plugin.json");
            if (File.Exists(manifestTemplate))
            {
                File.Copy(manifestTemplate, Path.Combine(stage, ".cursor-plugin", "plugin.json"), overwrite: true);
            }
            else
            {
                var version = typeof(QkrpcCursorPluginInstaller).Assembly.GetName().Version?.ToString() ?? "0.0.0";
                File.WriteAllText(
                    Path.Combine(stage, ".cursor-plugin", "plugin.json"),
                    $$"""
                    {
                      "name": "quicker-rpc",
                      "displayName": "Quicker RPC",
                      "description": "Quicker action authoring in Cursor: qkrpc MCP, skills, and rules.",
                      "version": "{{version}}",
                      "rules": "rules",
                      "skills": "skills",
                      "commands": "commands",
                      "mcpServers": "mcp.json"
                    }
                    """ + Environment.NewLine);
            }

            var agentSetupCmd = Path.Combine(exeDir, "cursor-plugin", "commands", "agent-setup.md");
            if (File.Exists(agentSetupCmd))
            {
                QkrpcAgentSetup.CopyDirectoryRecursive(
                    Path.Combine(exeDir, "cursor-plugin", "commands"),
                    Path.Combine(stage, "commands"));
            }

            return stage;
        }
        catch
        {
            if (Directory.Exists(stage))
            {
                try
                {
                    Directory.Delete(stage, recursive: true);
                }
                catch
                {
                    // ignore cleanup failure
                }
            }

            return null;
        }
    }
}
