namespace QuickerRpc.Console.Mcp;

internal static class QkrpcCodexPluginInstaller
{
    private const string PluginFolderName = "quicker-rpc";
    private const string MarketplaceFileName = "marketplace.json";

    internal static bool IsBundleAvailable() => ResolvePluginBundleSource() is not null;

    internal static IEnumerable<string> TryInstallPlugin()
    {
        var source = ResolvePluginBundleSource();
        if (source is null)
        {
            return new[]
            {
                "Codex plugin: skipped (bundle not found — reinstall qkrpc from GitHub release)",
            };
        }

        var agentsPluginsRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".agents",
            "plugins");
        var codexPluginsRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".codex",
            "plugins");
        var dest = Path.Combine(codexPluginsRoot, PluginFolderName);
        var legacyDest = Path.Combine(agentsPluginsRoot, PluginFolderName);
        var marketplacePath = Path.Combine(agentsPluginsRoot, MarketplaceFileName);

        try
        {
            Directory.CreateDirectory(agentsPluginsRoot);
            Directory.CreateDirectory(codexPluginsRoot);

            foreach (var old in new[] { dest, legacyDest })
            {
                if (Directory.Exists(old))
                {
                    Directory.Delete(old, recursive: true);
                }
            }

            QkrpcAgentSetup.CopyDirectoryRecursive(source, dest);
            WriteMcpConfig(dest, ResolveQkrpcExecutable());

            if (!File.Exists(Path.Combine(dest, ".codex-plugin", "plugin.json")))
            {
                throw new InvalidOperationException("missing .codex-plugin/plugin.json after copy");
            }

            WritePersonalMarketplace(marketplacePath);

            return new[]
            {
                $"Codex plugin: {dest}",
                $"Codex marketplace: {marketplacePath}",
                "Open Codex /plugins to install or enable quicker-rpc; verify with codex mcp list.",
            };
        }
        catch (Exception ex)
        {
            return new[]
            {
                $"Codex plugin: failed ({ex.Message})",
                "Fallback: pwsh ./scripts/install-codex-plugin.ps1",
            };
        }
    }

    private static void WritePersonalMarketplace(string marketplacePath)
    {
        var entry = new CodexMarketplacePluginEntry
        {
            Name = PluginFolderName,
            Source = new CodexMarketplaceSource
            {
                Source = "local",
                Path = "./.codex/plugins/quicker-rpc",
            },
            Policy = new CodexMarketplacePolicy
            {
                Installation = "AVAILABLE",
                Authentication = "ON_USE",
            },
            Category = "Productivity",
            Interface = new CodexMarketplacePluginInterface
            {
                DisplayName = "Quicker RPC",
                ShortDescription = "Headless Quicker action authoring via qkrpc MCP",
            },
        };

        CodexMarketplaceDocument document;
        if (File.Exists(marketplacePath))
        {
            var text = File.ReadAllText(marketplacePath, System.Text.Encoding.UTF8);
            document = System.Text.Json.JsonSerializer.Deserialize<CodexMarketplaceDocument>(text)
                ?? new CodexMarketplaceDocument();
        }
        else
        {
            document = new CodexMarketplaceDocument
            {
                Name = "quickerhub",
                Interface = new CodexMarketplaceInterface { DisplayName = "QuickerHub" },
                Metadata = new CodexMarketplaceMetadata
                {
                    Description = "Quicker action authoring for Codex (qkrpc MCP)",
                },
            };
        }

        var others = document.Plugins
            .Where(p => !string.Equals(p.Name, PluginFolderName, StringComparison.OrdinalIgnoreCase))
            .ToList();
        others.Insert(0, entry);
        document.Plugins = others;

        var json = System.Text.Json.JsonSerializer.Serialize(document, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
        }) + Environment.NewLine;
        File.WriteAllText(marketplacePath, json, System.Text.Encoding.UTF8);
    }

    private static string ResolveQkrpcExecutable()
    {
        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(processPath) && File.Exists(processPath))
        {
            return Path.GetFullPath(processPath);
        }

        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var defaultPath = Path.Combine(localAppData, "Programs", "qkrpc", "qkrpc.exe");
        if (File.Exists(defaultPath))
        {
            return Path.GetFullPath(defaultPath);
        }

        return "qkrpc";
    }

    private static void WriteMcpConfig(string pluginRoot, string qkrpcExe)
    {
        var mcpPath = Path.Combine(pluginRoot, ".mcp.json");
        var json =
            $$"""
            {
              "mcpServers": {
                "qkrpc": {
                  "command": {{System.Text.Json.JsonSerializer.Serialize(qkrpcExe)}},
                  "args": ["mcp"]
                }
              }
            }
            """ + Environment.NewLine;
        File.WriteAllText(mcpPath, json, System.Text.Encoding.UTF8);
    }

    private static string? ResolvePluginBundleSource()
    {
        foreach (var candidate in EnumerateBundleCandidates())
        {
            if (File.Exists(Path.Combine(candidate, ".codex-plugin", "plugin.json")))
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
            yield return Path.Combine(exeDir, "codex-plugin");
            yield return Path.Combine(exeDir, "codex-plugin", "quicker-rpc");
        }

        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            yield return Path.Combine(dir, "codex-plugin", "quicker-rpc");
            yield return Path.Combine(dir, "codex-plugin");
        }
    }

    private static string? TryAssembleFromBundledAssets()
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (string.IsNullOrWhiteSpace(exeDir))
        {
            return null;
        }

        var skillsRoot = Path.Combine(exeDir, "skills");
        if (!Directory.Exists(skillsRoot))
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
            "qkrpc-codex-plugin-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(stage);
            Directory.CreateDirectory(Path.Combine(stage, ".codex-plugin"));
            Directory.CreateDirectory(Path.Combine(stage, "assets"));

            QkrpcAgentSetup.CopyDirectoryRecursive(skillsRoot, Path.Combine(stage, "skills"));

            var mcpTemplate = Path.Combine(exeDir, "codex-plugin", ".mcp.json");
            if (File.Exists(mcpTemplate))
            {
                File.Copy(mcpTemplate, Path.Combine(stage, ".mcp.json"), overwrite: true);
            }
            else
            {
                File.WriteAllText(
                    Path.Combine(stage, ".mcp.json"),
                    """
                    {
                      "mcpServers": {
                        "qkrpc": {
                          "command": "qkrpc",
                          "args": ["mcp"]
                        }
                      }
                    }
                    """ + Environment.NewLine);
            }

            var manifestTemplate = Path.Combine(exeDir, "codex-plugin", ".codex-plugin", "plugin.json");
            if (File.Exists(manifestTemplate))
            {
                File.Copy(manifestTemplate, Path.Combine(stage, ".codex-plugin", "plugin.json"), overwrite: true);
            }
            else
            {
                var version = typeof(QkrpcCodexPluginInstaller).Assembly.GetName().Version?.ToString() ?? "0.0.0";
                File.WriteAllText(
                    Path.Combine(stage, ".codex-plugin", "plugin.json"),
                    $$"""
                    {
                      "name": "quicker-rpc",
                      "version": "{{version}}",
                      "description": "Quicker action authoring via qkrpc MCP",
                      "skills": "./skills/",
                      "mcpServers": "./.mcp.json"
                    }
                    """ + Environment.NewLine);
            }

            var assetsDir = Path.Combine(exeDir, "codex-plugin", "assets");
            if (Directory.Exists(assetsDir))
            {
                QkrpcAgentSetup.CopyDirectoryRecursive(assetsDir, Path.Combine(stage, "assets"));
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

    private sealed class CodexMarketplaceDocument
    {
        public string Name { get; set; } = "quickerhub";
        public CodexMarketplaceInterface? Interface { get; set; }
        public CodexMarketplaceMetadata? Metadata { get; set; }
        public List<CodexMarketplacePluginEntry> Plugins { get; set; } = [];
    }

    private sealed class CodexMarketplaceInterface
    {
        public string DisplayName { get; set; } = "QuickerHub";
    }

    private sealed class CodexMarketplaceMetadata
    {
        public string Description { get; set; } = string.Empty;
    }

    private sealed class CodexMarketplacePluginEntry
    {
        public string Name { get; set; } = string.Empty;
        public CodexMarketplaceSource Source { get; set; } = new();
        public CodexMarketplacePolicy Policy { get; set; } = new();
        public string Category { get; set; } = string.Empty;
        public CodexMarketplacePluginInterface? Interface { get; set; }
    }

    private sealed class CodexMarketplaceSource
    {
        public string Source { get; set; } = "local";
        public string Path { get; set; } = string.Empty;
    }

    private sealed class CodexMarketplacePolicy
    {
        public string Installation { get; set; } = "AVAILABLE";
        public string Authentication { get; set; } = "ON_USE";
    }

    private sealed class CodexMarketplacePluginInterface
    {
        public string DisplayName { get; set; } = string.Empty;
        public string ShortDescription { get; set; } = string.Empty;
    }
}
