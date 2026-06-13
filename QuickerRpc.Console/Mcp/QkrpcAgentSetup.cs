using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcAgentSetup
{
    private const string ServerName = "qkrpc";
    private const string RulesFileName = "qkrpc.mdc";
    private static readonly string[] DefaultSkillNames = QkrpcAgentSetupDefaults.DefaultSkillNames;

    internal static async Task<int> RunAsync(QkrpcAgentSetupOptions options)
    {
        try
        {
            if (options.Check)
            {
                return RunCheck(options);
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
                var followAgent = QkrpcMcpWorkspaceResolver.ShouldFollowAgentWorkspace(options.Workspace);
                QkrpcAgentSetupVerification.MergeMcpConfigFile(
                    configPath,
                    target.Format,
                    qkrpcExe,
                    followAgent ? null : workspace,
                    cliVersion);
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

            if (options.Codex || options.All)
            {
                var followAgent = QkrpcMcpWorkspaceResolver.ShouldFollowAgentWorkspace(options.Workspace);
                results.AddRange(InstallCodexMcp(qkrpcExe, followAgent ? null : workspace, cliVersion));
                results.AddRange(QkrpcAgentSetupGuidance.InstallCodexGuidance(options, workspace));
            }

            var targetIds = targets.Select(t => t.Id).Distinct().ToList();
            if ((options.Codex || options.All) && !targetIds.Contains("codex", StringComparer.OrdinalIgnoreCase))
            {
                targetIds.Add("codex");
            }

            WriteManifest(
                scope: options.Project ? "project" : "user",
                workspace: workspace,
                cliVersion: cliVersion,
                targets: targetIds,
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
            if (QkrpcMcpWorkspaceResolver.ShouldFollowAgentWorkspace(options.Workspace))
            {
                global::System.Console.Error.WriteLine(
                    $"Workspace: follows MCP host (${QkrpcMcpWorkspaceResolver.FollowAgentWorkspaceToken})");
            }
            else
            {
                global::System.Console.Error.WriteLine($"QKRPC_WORKSPACE_ROOT={workspace} (fixed)");
            }
            global::System.Console.Error.WriteLine("User manifest: ~/.qkrpc/agent-setup.json");
            if (options.Project)
            {
                global::System.Console.Error.WriteLine($"Project manifest: {Path.Combine(workspace, ".qkrpc", "agent-setup.json")}");
            }

            global::System.Console.Error.WriteLine("Restart your MCP host (Cursor / VS Code / Claude / Codex) to load servers.");
            global::System.Console.Error.WriteLine("Verify: qkrpc agent setup --check [--json]");
            global::System.Console.Error.WriteLine("Agent self-install: docs/agent-mcp-self-install.md");
            global::System.Console.Error.WriteLine("Integration guide: docs/agent-mcp-integration.md");

            if (options.Json)
            {
                WriteInstallJson(
                    ok: true,
                    cliVersion: cliVersion,
                    workspace: workspace,
                    results: results,
                    nextSteps:
                    [
                        "Reload MCP host (Cursor: Settings → MCP → Reload)",
                        "qkrpc agent setup --check",
                    ]);
            }

            await Task.CompletedTask.ConfigureAwait(false);
            return ExitCodes.Success;
        }
        catch (Exception ex)
        {
            global::System.Console.Error.WriteLine("qkrpc agent setup failed: " + ex.Message);
            if (options.Json)
            {
                WriteInstallJson(
                    ok: false,
                    cliVersion: ResolveCliVersionSafe(),
                    workspace: options.Workspace,
                    results: [],
                    nextSteps: ["Fix the error above and re-run qkrpc agent setup"],
                    error: ex.Message);
            }

            return ExitCodes.Error;
        }
    }

    private static string ResolveCliVersionSafe()
    {
        try
        {
            return ResolveCliVersion();
        }
        catch
        {
            return "unknown";
        }
    }

    private static void WriteInstallJson(
        bool ok,
        string cliVersion,
        string? workspace,
        IReadOnlyList<string> results,
        IReadOnlyList<string> nextSteps,
        string? error = null)
    {
        var payload = new JsonObject
        {
            ["ok"] = ok,
            ["cliVersion"] = cliVersion,
            ["workspaceRoot"] = workspace,
            ["results"] = new JsonArray(results.Select(r => JsonValue.Create(r)).ToArray()),
            ["nextSteps"] = new JsonArray(nextSteps.Select(s => JsonValue.Create(s)).ToArray()),
        };
        if (!string.IsNullOrWhiteSpace(error))
        {
            payload["error"] = error;
        }

        global::System.Console.Out.WriteLine(payload.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static int RunCheck(QkrpcAgentSetupOptions options)
    {
        var qkrpcExe = ResolveQkrpcExecutable();
        var cliVersion = ResolveCliVersion();
        var manifestPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".qkrpc",
            "agent-setup.json");

        AgentSetupManifest? manifest = null;
        if (File.Exists(manifestPath))
        {
            var text = File.ReadAllText(manifestPath, System.Text.Encoding.UTF8);
            manifest = JsonSerializer.Deserialize<AgentSetupManifest>(text);
        }

        var result = QkrpcAgentSetupVerification.RunCheck(qkrpcExe, cliVersion, manifest, manifestPath);

        if (options.Json)
        {
            global::System.Console.Out.WriteLine(
                JsonSerializer.Serialize(result, AgentSetupCheckJson.Options));
        }
        else
        {
            EmitCheckHumanReadable(result);
        }

        return result.Ok ? ExitCodes.Success : ExitCodes.Error;
    }

    private static void EmitCheckHumanReadable(AgentSetupCheckResult result)
    {
        if (result.Ok)
        {
            global::System.Console.Error.WriteLine($"qkrpc agent setup: OK (CLI {result.CliVersion})");
            foreach (var mcp in result.McpConfigs)
            {
                global::System.Console.Error.WriteLine($"  MCP {mcp.Target}: {mcp.Path}");
            }

            foreach (var skill in result.Skills.Where(s => s.Installed))
            {
                global::System.Console.Error.WriteLine($"  skill: {skill.Name}");
            }

            if (result.RulesInstalled)
            {
                global::System.Console.Error.WriteLine("  rules: qkrpc.mdc");
            }

            return;
        }

        global::System.Console.Error.WriteLine("qkrpc agent setup: issues found");
        foreach (var issue in result.Issues)
        {
            global::System.Console.Error.WriteLine($"  [{issue.Code}] {issue.Message}");
            global::System.Console.Error.WriteLine($"    fix: {issue.Remediation}");
        }

        if (result.NextSteps.Count > 0)
        {
            global::System.Console.Error.WriteLine();
            global::System.Console.Error.WriteLine("Next steps:");
            foreach (var step in result.NextSteps)
            {
                global::System.Console.Error.WriteLine("  " + step);
            }
        }
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
        if (options.Codex)
        {
            results.AddRange(QkrpcAgentSetupGuidance.InstallCodexGuidance(options, workspace));
        }

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
        var workspace = ResolveWorkspace(options);

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
                || options.Cline
                || options.Codex;

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
            foreach (var target in McpInstallTarget.ProjectTargets(workspace))
            {
                yield return target;
            }
        }
    }

    private static class AgentSetupCheckJson
    {
        internal static readonly JsonSerializerOptions Options = new()
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };
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

    private static IEnumerable<string> InstallCodexMcp(string qkrpcExe, string? workspaceRoot, string cliVersion)
    {
        var codex = FindExecutableOnPath("codex");
        if (codex is null)
        {
            yield return "Codex MCP: skipped (codex not in PATH)";
            yield return BuildCodexMcpManualHint(qkrpcExe, workspaceRoot);
            yield return "Agent doc: docs/agent-mcp-self-install.md";
            yield break;
        }

        using var process = new Process { StartInfo = BuildCodexMcpAddStartInfo(codex, qkrpcExe, workspaceRoot, cliVersion) };
        process.Start();
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            yield return $"Codex MCP: codex mcp add failed (exit {process.ExitCode})";
            if (!string.IsNullOrWhiteSpace(stderr))
            {
                yield return "  " + stderr.Trim().Replace('\n', ' ');
            }

            yield return BuildCodexMcpManualHint(qkrpcExe, workspaceRoot);
            yield break;
        }

        var configPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            "config.toml");
        yield return $"Codex MCP: {configPath}";
        if (!string.IsNullOrWhiteSpace(stdout))
        {
            yield return "  " + stdout.Trim().Replace('\n', ' ');
        }
    }

    private static ProcessStartInfo BuildCodexMcpAddStartInfo(
        string codexExe,
        string qkrpcExe,
        string? workspaceRoot,
        string cliVersion)
    {
        var start = new ProcessStartInfo
        {
            FileName = codexExe,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        start.ArgumentList.Add("mcp");
        start.ArgumentList.Add("add");
        start.ArgumentList.Add(ServerName);
        if (!string.IsNullOrWhiteSpace(workspaceRoot))
        {
            start.ArgumentList.Add("--env");
            start.ArgumentList.Add($"QKRPC_WORKSPACE_ROOT={workspaceRoot}");
        }

        start.ArgumentList.Add("--env");
        start.ArgumentList.Add($"QKRPC_SETUP_VERSION={cliVersion}");
        start.ArgumentList.Add("--");
        start.ArgumentList.Add(qkrpcExe);
        start.ArgumentList.Add("mcp");
        return start;
    }

    private static string BuildCodexMcpManualHint(string qkrpcExe, string? workspaceRoot)
    {
        if (string.IsNullOrWhiteSpace(workspaceRoot))
        {
            return $"Codex MCP manual: codex mcp add {ServerName} --env QKRPC_SETUP_VERSION=<version> -- \"{qkrpcExe}\" mcp";
        }

        return $"Codex MCP manual: codex mcp add {ServerName} --env QKRPC_WORKSPACE_ROOT={workspaceRoot} --env QKRPC_SETUP_VERSION=<version> -- \"{qkrpcExe}\" mcp";
    }

    private static string? FindExecutableOnPath(string name)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathEnv))
        {
            return null;
        }

        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT").Split(';', StringSplitOptions.RemoveEmptyEntries)
            : [string.Empty];

        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = dir.Trim();
            if (trimmed.Length == 0)
            {
                continue;
            }

            foreach (var ext in extensions)
            {
                var candidate = Path.Combine(trimmed, name + ext);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        return null;
    }
}
