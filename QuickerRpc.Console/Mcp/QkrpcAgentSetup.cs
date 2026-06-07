using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcAgentSetup
{
    private const string ServerName = "qkrpc";
    private const string RulesFileName = "qkrpc.mdc";
    private static readonly string[] DefaultSkillNames =
    [
        "qkrpc",
        "quicker-authoring",
        "quicker-sync",
        "quicker-run",
    ];

    internal static async Task<int> RunAsync(QkrpcAgentSetupOptions options)
    {
        try
        {
            if (options.Check)
            {
                return RunCheck();
            }

            if (options.Upgrade)
            {
                return await RunUpgradeAsync(options).ConfigureAwait(false);
            }

            var qkrpcExe = ResolveQkrpcExecutable();
            var cliVersion = ResolveCliVersion();
            var workspace = ResolveWorkspace(options);
            var targets = ResolveInstallTargets(options).ToList();
            var results = new List<string>();
            var installedSkillNames = new List<string>();

            foreach (var target in targets)
            {
                var configPath = Path.GetFullPath(target.ResolveConfigPath());
                MergeMcpConfig(configPath, target.Format, qkrpcExe, workspace, cliVersion);
                results.Add($"MCP {target.DisplayName}: {configPath}");
            }

            if (!options.SkipSkill)
            {
                var userSkillsDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    ".cursor",
                    "skills");
                foreach (var line in InstallSkills(options, userSkillsDir, "user skills", installedSkillNames))
                {
                    results.Add(line);
                }

                if (options.Project && options.ProjectSkills)
                {
                    var projectSkillsDir = Path.Combine(workspace, ".cursor", "skills");
                    foreach (var line in InstallSkills(options, projectSkillsDir, "project skills", installedSkillNames))
                    {
                        results.Add(line);
                    }
                }
            }

            var rulesResults = InstallRules(options, workspace);
            results.AddRange(rulesResults);

            results.AddRange(QkrpcAgentSetupGuidance.InstallClaudeCodeGuidance(options, workspace));

            WriteManifest(
                scope: options.Project ? "project" : "user",
                workspace: workspace,
                cliVersion: cliVersion,
                targets: targets.Select(t => t.Id).Distinct().ToList(),
                skills: installedSkillNames.Distinct().ToList(),
                writeProjectManifest: options.Project);

            if (ShouldBootstrapWorkspace(options, workspace))
            {
                BootstrapWorkspace(workspace);
                results.Add($"workspace index: {Path.Combine(workspace, QkrpcMcpWorkspaceIndex.RelativePath)}");
            }

            if (options.Project)
            {
                EnsureWorkspaceTerminalEnv(workspace);
                results.Add($"terminal PATH: {Path.Combine(workspace, ".vscode", "settings.json")}");
            }

            global::System.Console.Error.WriteLine("qkrpc agent setup completed:");
            foreach (var line in results)
            {
                global::System.Console.Error.WriteLine("  " + line);
            }

            global::System.Console.Error.WriteLine();
            global::System.Console.Error.WriteLine($"CLI version: {cliVersion}");
            global::System.Console.Error.WriteLine($"QKRPC_WORKSPACE_ROOT={workspace}");
            global::System.Console.Error.WriteLine("User manifest: ~/.qkrpc/agent-setup.json");
            if (options.Project)
            {
                global::System.Console.Error.WriteLine($"Project manifest: {Path.Combine(workspace, ".qkrpc", "agent-setup.json")}");
            }

            global::System.Console.Error.WriteLine("Restart your MCP host (Cursor / VS Code / Claude) to load servers.");
            global::System.Console.Error.WriteLine("Integration guide: docs/agent-mcp-integration.md");

            await Task.CompletedTask.ConfigureAwait(false);
            return ExitCodes.Success;
        }
        catch (Exception ex)
        {
            global::System.Console.Error.WriteLine("qkrpc agent setup failed: " + ex.Message);
            return ExitCodes.Error;
        }
    }

    private static int RunCheck()
    {
        var cliVersion = ResolveCliVersion();
        var manifestPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".qkrpc",
            "agent-setup.json");

        if (!File.Exists(manifestPath))
        {
            global::System.Console.Error.WriteLine(
                "qkrpc agent setup: not installed (missing ~/.qkrpc/agent-setup.json). Run: qkrpc agent setup");
            return ExitCodes.Error;
        }

        var text = File.ReadAllText(manifestPath, System.Text.Encoding.UTF8);
        var manifest = JsonSerializer.Deserialize<AgentSetupManifest>(text);
        if (manifest is null || string.IsNullOrWhiteSpace(manifest.CliVersion))
        {
            global::System.Console.Error.WriteLine("qkrpc agent setup: invalid manifest. Run: qkrpc agent setup");
            return ExitCodes.Error;
        }

        if (!string.Equals(manifest.CliVersion, cliVersion, StringComparison.OrdinalIgnoreCase))
        {
            global::System.Console.Error.WriteLine(
                $"qkrpc agent setup: outdated (manifest {manifest.CliVersion}, CLI {cliVersion}). Run: qkrpc agent setup --upgrade");
            return ExitCodes.Error;
        }

        global::System.Console.Error.WriteLine($"qkrpc agent setup: OK (CLI {cliVersion})");
        return ExitCodes.Success;
    }

    private static async Task<int> RunUpgradeAsync(QkrpcAgentSetupOptions options)
    {
        var manifest = LoadUserManifest();
        if (manifest is null)
        {
            global::System.Console.Error.WriteLine(
                "qkrpc agent setup: not installed (missing ~/.qkrpc/agent-setup.json). Run: qkrpc agent setup");
            return ExitCodes.Error;
        }

        var cliVersion = ResolveCliVersion();
        var workspace = ResolveWorkspaceForUpgrade(options, manifest);
        var results = new List<string> { "MCP: skipped (--upgrade preserves existing config)" };
        var installedSkillNames = new List<string>();

        if (!options.SkipSkill)
        {
            var userSkillsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".cursor",
                "skills");
            foreach (var line in InstallSkills(options, userSkillsDir, "user skills", installedSkillNames))
            {
                results.Add(line);
            }

            if (options.Project && options.ProjectSkills)
            {
                var projectSkillsDir = Path.Combine(workspace, ".cursor", "skills");
                foreach (var line in InstallSkills(options, projectSkillsDir, "project skills", installedSkillNames))
                {
                    results.Add(line);
                }
            }
        }

        results.AddRange(InstallRules(options, workspace));
        results.AddRange(QkrpcAgentSetupGuidance.InstallClaudeCodeGuidance(options, workspace));

        var skills = installedSkillNames.Count > 0
            ? installedSkillNames.Distinct().ToList()
            : manifest.Skills.ToList();

        WriteManifest(
            scope: options.Project ? "project" : manifest.Scope,
            workspace: workspace,
            cliVersion: cliVersion,
            targets: manifest.Targets,
            skills: skills,
            writeProjectManifest: options.Project);

        global::System.Console.Error.WriteLine("qkrpc agent setup --upgrade completed:");
        foreach (var line in results)
        {
            global::System.Console.Error.WriteLine("  " + line);
        }

        global::System.Console.Error.WriteLine();
        global::System.Console.Error.WriteLine($"CLI version: {cliVersion}");
        global::System.Console.Error.WriteLine("MCP configs unchanged. Restart MCP host if you also changed qkrpc.exe path manually.");

        await Task.CompletedTask.ConfigureAwait(false);
        return ExitCodes.Success;
    }

    private static AgentSetupManifest? LoadUserManifest()
    {
        var manifestPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".qkrpc",
            "agent-setup.json");

        if (!File.Exists(manifestPath))
        {
            return null;
        }

        var text = File.ReadAllText(manifestPath, System.Text.Encoding.UTF8);
        return JsonSerializer.Deserialize<AgentSetupManifest>(text);
    }

    private static string ResolveWorkspaceForUpgrade(QkrpcAgentSetupOptions options, AgentSetupManifest manifest)
    {
        if (!string.IsNullOrWhiteSpace(options.Workspace))
        {
            return Path.GetFullPath(options.Workspace.Trim());
        }

        if (!string.IsNullOrWhiteSpace(manifest.WorkspaceRoot) && Directory.Exists(manifest.WorkspaceRoot))
        {
            return Path.GetFullPath(manifest.WorkspaceRoot);
        }

        return Path.GetFullPath(Directory.GetCurrentDirectory());
    }

    private static string ResolveCliVersion()
    {
        var version = Assembly.GetExecutingAssembly().GetName().Version;
        if (version is null)
        {
            return "0.0.0";
        }

        return version.Revision > 0
            ? $"{version.Major}.{version.Minor}.{version.Build}.{version.Revision}"
            : $"{version.Major}.{version.Minor}.{version.Build}";
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

    private static string ResolveWorkspace(QkrpcAgentSetupOptions options)
    {
        var configured = options.Workspace?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured);
        }

        return Path.GetFullPath(Directory.GetCurrentDirectory());
    }

    private static bool ShouldBootstrapWorkspace(QkrpcAgentSetupOptions options, string workspaceRoot)
    {
        if (options.Project)
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(options.Workspace))
        {
            return true;
        }

        return Directory.Exists(Path.Combine(workspaceRoot, ".quicker"));
    }

    private static IEnumerable<McpInstallTarget> ResolveInstallTargets(QkrpcAgentSetupOptions options)
    {
        if (options.All)
        {
            foreach (var target in McpInstallTarget.AllUserTargets)
            {
                yield return target;
            }
        }
        else
        {
            var explicitUser =
                options.Cursor
                || options.Claude
                || options.Vscode
                || options.Windsurf
                || options.Cline;

            if (!explicitUser)
            {
                yield return McpInstallTarget.Cursor;
            }
            else
            {
                if (options.Cursor)
                {
                    yield return McpInstallTarget.Cursor;
                }

                if (options.Claude)
                {
                    yield return McpInstallTarget.ClaudeDesktop;
                }

                if (options.Vscode)
                {
                    yield return McpInstallTarget.VscodeUser;
                }

                if (options.Windsurf)
                {
                    yield return McpInstallTarget.Windsurf;
                }

                if (options.Cline)
                {
                    yield return McpInstallTarget.Cline;
                }
            }
        }

        if (options.Project)
        {
            foreach (var target in McpInstallTarget.AllProjectTargets)
            {
                yield return target;
            }
        }
    }

    private static void MergeMcpConfig(
        string configPath,
        McpConfigFormat format,
        string qkrpcExe,
        string workspaceRoot,
        string cliVersion)
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

        var env = new JsonObject
        {
            ["QKRPC_WORKSPACE_ROOT"] = workspaceRoot,
            ["QKRPC_SETUP_VERSION"] = cliVersion,
        };

        switch (format)
        {
            case McpConfigFormat.VsCodeServers:
            {
                var servers = root["servers"] as JsonObject ?? new JsonObject();
                servers[ServerName] = new JsonObject
                {
                    ["type"] = "stdio",
                    ["command"] = qkrpcExe,
                    ["args"] = new JsonArray("mcp"),
                    ["env"] = env,
                };
                root["servers"] = servers;
                break;
            }

            default:
            {
                var servers = root["mcpServers"] as JsonObject ?? new JsonObject();
                servers[ServerName] = new JsonObject
                {
                    ["command"] = qkrpcExe,
                    ["args"] = new JsonArray("mcp"),
                    ["env"] = env,
                };
                root["mcpServers"] = servers;
                break;
            }
        }

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(configPath, json + Environment.NewLine, System.Text.Encoding.UTF8);
    }

    private static IEnumerable<string> InstallSkills(
        QkrpcAgentSetupOptions options,
        string skillsDestRoot,
        string label,
        ICollection<string> installedSkillNames)
    {
        var results = new List<string>();
        var explicitSource = options.SkillSource?.Trim();

        if (!string.IsNullOrWhiteSpace(explicitSource))
        {
            var path = Path.GetFullPath(explicitSource);
            if (File.Exists(Path.Combine(path, "SKILL.md")))
            {
                var skillName = Path.GetFileName(path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
                var dest = Path.Combine(skillsDestRoot, skillName);
                CopyDirectory(path, dest);
                installedSkillNames.Add(skillName);
                results.Add($"{label}: {dest}");
                return results;
            }
        }

        var skillsRoot = ResolveSkillsRoot(explicitSource);
        if (skillsRoot is null)
        {
            results.Add($"{label}: skipped (skills source not found)");
            return results;
        }

        foreach (var skillName in DefaultSkillNames)
        {
            var source = Path.Combine(skillsRoot, skillName);
            if (!Directory.Exists(source) || !File.Exists(Path.Combine(source, "SKILL.md")))
            {
                continue;
            }

            var dest = Path.Combine(skillsDestRoot, skillName);
            CopyDirectory(source, dest);
            installedSkillNames.Add(skillName);
            results.Add($"{label}: {dest}");
        }

        if (results.Count == 0)
        {
            results.Add($"{label}: skipped (no default skills found under {skillsRoot})");
        }

        return results;
    }

    private static string? ResolveSkillsRoot(string? explicitSource)
    {
        if (!string.IsNullOrWhiteSpace(explicitSource))
        {
            var path = Path.GetFullPath(explicitSource.Trim());
            if (Directory.Exists(path))
            {
                return path;
            }
        }

        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            var candidate = Path.Combine(dir, "docs", "skills");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(exeDir))
        {
            var bundled = Path.Combine(exeDir, "skills");
            if (Directory.Exists(bundled))
            {
                return bundled;
            }
        }

        return null;
    }

    private static IEnumerable<string> InstallRules(QkrpcAgentSetupOptions options, string workspace)
    {
        var source = ResolveRulesSource();
        if (source is null)
        {
            yield return "rules: skipped (qkrpc.mdc source not found)";
            yield break;
        }

        var userRulesDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "rules");
        Directory.CreateDirectory(userRulesDir);
        var userDest = Path.Combine(userRulesDir, RulesFileName);
        File.Copy(source, userDest, overwrite: true);
        yield return $"rules (user): {userDest}";

        if (options.Project)
        {
            var projectRulesDir = Path.Combine(workspace, ".cursor", "rules");
            Directory.CreateDirectory(projectRulesDir);
            var projectDest = Path.Combine(projectRulesDir, RulesFileName);
            File.Copy(source, projectDest, overwrite: true);
            yield return $"rules (project): {projectDest}";
        }
    }

    private static string? ResolveRulesSource()
    {
        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            var candidate = Path.Combine(dir, "docs", "agent-rules", RulesFileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(exeDir))
        {
            var bundled = Path.Combine(exeDir, "agent-rules", RulesFileName);
            if (File.Exists(bundled))
            {
                return bundled;
            }
        }

        return null;
    }

    private static void WriteManifest(
        string scope,
        string workspace,
        string cliVersion,
        IReadOnlyList<string> targets,
        IReadOnlyList<string> skills,
        bool writeProjectManifest)
    {
        var manifest = new AgentSetupManifest
        {
            CliVersion = cliVersion,
            InstalledAt = DateTime.UtcNow.ToString("o"),
            WorkspaceRoot = workspace,
            Targets = targets,
            Skills = skills,
            Scope = scope,
        };

        var json = JsonSerializer.Serialize(manifest, AgentSetupManifestJson.Options);

        var userDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".qkrpc");
        Directory.CreateDirectory(userDir);
        File.WriteAllText(Path.Combine(userDir, "agent-setup.json"), json + Environment.NewLine, System.Text.Encoding.UTF8);

        if (writeProjectManifest)
        {
            var projectDir = Path.Combine(workspace, ".qkrpc");
            Directory.CreateDirectory(projectDir);
            File.WriteAllText(Path.Combine(projectDir, "agent-setup.json"), json + Environment.NewLine, System.Text.Encoding.UTF8);
        }
    }

    private static void BootstrapWorkspace(string workspaceRoot)
    {
        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
    }

    private static void EnsureWorkspaceTerminalEnv(string workspaceRoot)
    {
        var vscodeDir = Path.Combine(workspaceRoot, ".vscode");
        Directory.CreateDirectory(vscodeDir);
        var settingsPath = Path.Combine(vscodeDir, "settings.json");

        JsonObject root;
        if (File.Exists(settingsPath))
        {
            var text = File.ReadAllText(settingsPath, System.Text.Encoding.UTF8);
            root = JsonNode.Parse(text)?.AsObject() ?? new JsonObject();
        }
        else
        {
            root = new JsonObject();
        }

        MergeTerminalEnv(root, "terminal.integrated.env.windows", new JsonObject
        {
            ["PATH"] = "${workspaceFolder}\\publish\\cli;${env:LOCALAPPDATA}\\Programs\\qkrpc;${env:PATH}",
            ["QKRPC_WORKSPACE_ROOT"] = "${workspaceFolder}",
            ["QKRPC_CWD"] = "${workspaceFolder}",
        });
        MergeTerminalEnv(root, "terminal.integrated.env.osx", new JsonObject
        {
            ["PATH"] = "${workspaceFolder}/publish/cli:${env:PATH}",
            ["QKRPC_WORKSPACE_ROOT"] = "${workspaceFolder}",
            ["QKRPC_CWD"] = "${workspaceFolder}",
        });
        MergeTerminalEnv(root, "terminal.integrated.env.linux", new JsonObject
        {
            ["PATH"] = "${workspaceFolder}/publish/cli:${env:PATH}",
            ["QKRPC_WORKSPACE_ROOT"] = "${workspaceFolder}",
            ["QKRPC_CWD"] = "${workspaceFolder}",
        });

        var json = root.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(settingsPath, json + Environment.NewLine, System.Text.Encoding.UTF8);
    }

    private static void MergeTerminalEnv(JsonObject root, string key, JsonObject defaults)
    {
        var existing = root[key] as JsonObject ?? new JsonObject();
        foreach (var pair in defaults)
        {
            if (existing[pair.Key] is null)
            {
                existing[pair.Key] = pair.Value?.DeepClone();
            }
        }

        root[key] = existing;
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

    private sealed class AgentSetupManifest
    {
        [JsonPropertyName("cliVersion")]
        public string CliVersion { get; set; } = "";

        [JsonPropertyName("installedAt")]
        public string InstalledAt { get; set; } = "";

        [JsonPropertyName("workspaceRoot")]
        public string WorkspaceRoot { get; set; } = "";

        [JsonPropertyName("targets")]
        public IReadOnlyList<string> Targets { get; set; } = [];

        [JsonPropertyName("skills")]
        public IReadOnlyList<string> Skills { get; set; } = [];

        [JsonPropertyName("scope")]
        public string Scope { get; set; } = "user";
    }

    private static class AgentSetupManifestJson
    {
        internal static readonly JsonSerializerOptions Options = new() { WriteIndented = true };
    }
}
