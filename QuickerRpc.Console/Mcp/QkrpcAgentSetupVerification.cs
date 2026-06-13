using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace QuickerRpc.Console.Mcp;

internal sealed class AgentSetupCheckIssue
{
    [JsonPropertyName("code")]
    public string Code { get; init; } = "";

    [JsonPropertyName("message")]
    public string Message { get; init; } = "";

    [JsonPropertyName("remediation")]
    public string Remediation { get; init; } = "";

    [JsonPropertyName("path")]
    public string? Path { get; init; }
}

internal sealed class AgentSetupCheckResult
{
    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("cliVersion")]
    public string CliVersion { get; init; } = "";

    [JsonPropertyName("manifestVersion")]
    public string? ManifestVersion { get; init; }

    [JsonPropertyName("qkrpcExe")]
    public string QkrpcExe { get; init; } = "";

    [JsonPropertyName("workspaceRoot")]
    public string? WorkspaceRoot { get; init; }

    [JsonPropertyName("issues")]
    public IReadOnlyList<AgentSetupCheckIssue> Issues { get; init; } = [];

    [JsonPropertyName("mcpConfigs")]
    public IReadOnlyList<AgentSetupMcpCheck> McpConfigs { get; init; } = [];

    [JsonPropertyName("skills")]
    public IReadOnlyList<AgentSetupSkillCheck> Skills { get; init; } = [];

    [JsonPropertyName("rulesInstalled")]
    public bool RulesInstalled { get; init; }

    [JsonPropertyName("nextSteps")]
    public IReadOnlyList<string> NextSteps { get; init; } = [];
}

internal sealed class AgentSetupMcpCheck
{
    [JsonPropertyName("target")]
    public string Target { get; init; } = "";

    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("installed")]
    public bool Installed { get; init; }

    [JsonPropertyName("commandMatches")]
    public bool CommandMatches { get; init; }

    [JsonPropertyName("workspaceRoot")]
    public string? WorkspaceRoot { get; init; }
}

internal sealed class AgentSetupSkillCheck
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("installed")]
    public bool Installed { get; init; }
}

internal static class QkrpcAgentSetupVerification
{
    private const string ServerName = "qkrpc";
    private const string RulesFileName = "qkrpc.mdc";

    internal static AgentSetupCheckResult RunCheck(
        string qkrpcExe,
        string cliVersion,
        AgentSetupManifest? manifest,
        string manifestPath)
    {
        var issues = new List<AgentSetupCheckIssue>();
        var nextSteps = new List<string>();

        if (manifest is null || string.IsNullOrWhiteSpace(manifest.CliVersion))
        {
            issues.Add(new AgentSetupCheckIssue
            {
                Code = "manifest_missing",
                Message = $"Agent setup manifest not found or invalid: {manifestPath}",
                Remediation = "qkrpc agent setup --workspace <path>",
                Path = manifestPath,
            });
            nextSteps.Add("qkrpc agent setup --workspace <path>");
        }
        else if (!string.Equals(manifest.CliVersion, cliVersion, StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(new AgentSetupCheckIssue
            {
                Code = "manifest_outdated",
                Message = $"Manifest CLI {manifest.CliVersion} != current CLI {cliVersion}",
                Remediation = "qkrpc agent setup --upgrade",
                Path = manifestPath,
            });
            nextSteps.Add("qkrpc agent setup --upgrade");
        }

        var mcpChecks = new List<AgentSetupMcpCheck>();
        var targets = manifest?.Targets ?? ["cursor"];
        foreach (var targetId in targets.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.Equals(targetId, "codex", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var target = ResolveTargetById(targetId);
            if (target is null)
            {
                continue;
            }

            var configPath = Path.GetFullPath(target.ResolveConfigPath());
            var entry = TryReadMcpServerEntry(configPath, target.Format, ServerName);
            var installed = entry is not null;
            var commandMatches = installed
                && PathsEqual(entry!.Command, qkrpcExe);

            mcpChecks.Add(new AgentSetupMcpCheck
            {
                Target = targetId,
                Path = configPath,
                Installed = installed,
                CommandMatches = commandMatches,
                WorkspaceRoot = entry?.WorkspaceRoot,
            });

            if (!installed)
            {
                issues.Add(new AgentSetupCheckIssue
                {
                    Code = "mcp_missing",
                    Message = $"MCP server '{ServerName}' not configured for {target.DisplayName}",
                    Remediation = "qkrpc agent setup",
                    Path = configPath,
                });
                if (!nextSteps.Contains("qkrpc agent setup"))
                {
                    nextSteps.Add("qkrpc agent setup");
                }
            }
            else if (!commandMatches)
            {
                issues.Add(new AgentSetupCheckIssue
                {
                    Code = "mcp_exe_mismatch",
                    Message = $"MCP command does not match current qkrpc.exe for {target.DisplayName}",
                    Remediation = "qkrpc agent setup",
                    Path = configPath,
                });
                if (!nextSteps.Contains("qkrpc agent setup"))
                {
                    nextSteps.Add("qkrpc agent setup");
                }
            }
        }

        var skillChecks = new List<AgentSetupSkillCheck>();
        var skillNames = manifest?.Skills?.Count > 0
            ? manifest.Skills
            : QkrpcAgentSetupDefaults.DefaultSkillNames;
        var userSkillsDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "skills");

        foreach (var skillName in skillNames.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var skillPath = Path.Combine(userSkillsDir, skillName);
            var installed = Directory.Exists(skillPath) && File.Exists(Path.Combine(skillPath, "SKILL.md"));
            skillChecks.Add(new AgentSetupSkillCheck
            {
                Name = skillName,
                Path = skillPath,
                Installed = installed,
            });

            if (!installed)
            {
                issues.Add(new AgentSetupCheckIssue
                {
                    Code = "skill_missing",
                    Message = $"Skill '{skillName}' not installed under ~/.cursor/skills",
                    Remediation = "qkrpc agent setup --upgrade",
                    Path = skillPath,
                });
                if (!nextSteps.Contains("qkrpc agent setup --upgrade"))
                {
                    nextSteps.Add("qkrpc agent setup --upgrade");
                }
            }
        }

        var rulesPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".cursor",
            "rules",
            RulesFileName);
        var rulesInstalled = File.Exists(rulesPath);
        if (!rulesInstalled)
        {
            issues.Add(new AgentSetupCheckIssue
            {
                Code = "rules_missing",
                Message = "Cursor rule qkrpc.mdc not installed",
                Remediation = "qkrpc agent setup --upgrade",
                Path = rulesPath,
            });
            if (!nextSteps.Contains("qkrpc agent setup --upgrade"))
            {
                nextSteps.Add("qkrpc agent setup --upgrade");
            }
        }

        if (issues.Count == 0)
        {
            nextSteps.Add("Reload MCP host (Cursor: Settings → MCP → Reload)");
        }

        return new AgentSetupCheckResult
        {
            Ok = issues.Count == 0,
            CliVersion = cliVersion,
            ManifestVersion = manifest?.CliVersion,
            QkrpcExe = qkrpcExe,
            WorkspaceRoot = manifest?.WorkspaceRoot,
            Issues = issues,
            McpConfigs = mcpChecks,
            Skills = skillChecks,
            RulesInstalled = rulesInstalled,
            NextSteps = nextSteps.Distinct().ToList(),
        };
    }

    internal static bool TryReadMcpServerEntry(
        string configPath,
        McpConfigFormat format,
        string serverName,
        out McpServerEntry? entry)
    {
        entry = TryReadMcpServerEntry(configPath, format, serverName);
        return entry is not null;
    }

    internal static McpServerEntry? TryReadMcpServerEntry(
        string configPath,
        McpConfigFormat format,
        string serverName)
    {
        if (!File.Exists(configPath))
        {
            return null;
        }

        JsonObject? root;
        try
        {
            root = JsonNode.Parse(File.ReadAllText(configPath, System.Text.Encoding.UTF8))?.AsObject();
        }
        catch (JsonException)
        {
            return null;
        }

        if (root is null)
        {
            return null;
        }

        JsonObject? server = format switch
        {
            McpConfigFormat.VsCodeServers => root["servers"]?[serverName]?.AsObject(),
            _ => root["mcpServers"]?[serverName]?.AsObject(),
        };

        if (server is null)
        {
            return null;
        }

        var command = server["command"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        var workspaceRoot = server["env"]?["QKRPC_WORKSPACE_ROOT"]?.GetValue<string>();
        return new McpServerEntry(command, workspaceRoot);
    }

    internal static void MergeMcpConfigFile(
        string configPath,
        McpConfigFormat format,
        string qkrpcExe,
        string? workspaceRoot,
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
            ["QKRPC_WORKSPACE_ROOT"] = QkrpcMcpWorkspaceResolver.ResolveMcpEnvWorkspace(workspaceRoot),
            ["QKRPC_CWD"] = QkrpcMcpWorkspaceResolver.ResolveMcpEnvWorkspace(workspaceRoot),
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

    private static McpInstallTarget? ResolveTargetById(string targetId)
    {
        foreach (var target in McpInstallTarget.AllUserTargets)
        {
            if (string.Equals(target.Id, targetId, StringComparison.OrdinalIgnoreCase))
            {
                return target;
            }
        }

        foreach (var target in McpInstallTarget.AllProjectTargetIds)
        {
            if (string.Equals(target.Id, targetId, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
        }

        return null;
    }

    private static bool PathsEqual(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
        {
            return false;
        }

        try
        {
            return string.Equals(
                Path.GetFullPath(left.Trim()),
                Path.GetFullPath(right.Trim()),
                OperatingSystem.IsWindows()
                    ? StringComparison.OrdinalIgnoreCase
                    : StringComparison.Ordinal);
        }
        catch
        {
            return false;
        }
    }

    internal sealed record McpServerEntry(string Command, string? WorkspaceRoot);
}

internal sealed class AgentSetupManifest
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

internal static class AgentSetupManifestJson
{
    internal static readonly JsonSerializerOptions Options = new() { WriteIndented = true };
}

internal static class QkrpcAgentSetupDefaults
{
    internal static readonly string[] DefaultSkillNames =
    [
        "qkrpc",
        "quicker-rpc-knowledge",
        "quicker-authoring",
        "quicker-eval-expression",
        "quicker-run",
    ];
}
