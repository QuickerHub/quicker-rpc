using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class QkrpcAgentSetupVerificationTests
{
    [TestMethod]
    public void MergeMcpConfigFile_CursorFormat_WritesMcpServersEntry()
    {
        var temp = Path.Combine(Path.GetTempPath(), "qkrpc-setup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        var configPath = Path.Combine(temp, "mcp.json");
        var qkrpcExe = Path.Combine(temp, "qkrpc.exe");
        File.WriteAllText(qkrpcExe, string.Empty);
        var workspace = Path.Combine(temp, "workspace");

        try
        {
            QkrpcAgentSetupVerification.MergeMcpConfigFile(
                configPath,
                McpConfigFormat.McpServers,
                qkrpcExe,
                workspace,
                "1.2.3.4");

            Assert.IsTrue(QkrpcAgentSetupVerification.TryReadMcpServerEntry(
                configPath,
                McpConfigFormat.McpServers,
                "qkrpc",
                out var entry));
            Assert.AreEqual(Path.GetFullPath(qkrpcExe), Path.GetFullPath(entry!.Command));
            Assert.AreEqual(workspace, entry.WorkspaceRoot);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [TestMethod]
    public void MergeMcpConfigFile_VsCodeFormat_WritesServersEntry()
    {
        var temp = Path.Combine(Path.GetTempPath(), "qkrpc-setup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        var configPath = Path.Combine(temp, "mcp.json");
        var qkrpcExe = Path.Combine(temp, "qkrpc.exe");
        File.WriteAllText(qkrpcExe, string.Empty);

        try
        {
            QkrpcAgentSetupVerification.MergeMcpConfigFile(
                configPath,
                McpConfigFormat.VsCodeServers,
                qkrpcExe,
                temp,
                "1.0.0");

            Assert.IsTrue(QkrpcAgentSetupVerification.TryReadMcpServerEntry(
                configPath,
                McpConfigFormat.VsCodeServers,
                "qkrpc",
                out var entry));
            Assert.IsNotNull(entry);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [TestMethod]
    public void RunCheck_DetectsMissingManifest()
    {
        var temp = Path.Combine(Path.GetTempPath(), "qkrpc-setup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        var qkrpcExe = Path.Combine(temp, "qkrpc.exe");
        File.WriteAllText(qkrpcExe, string.Empty);
        var manifestPath = Path.Combine(temp, "agent-setup.json");

        try
        {
            var result = QkrpcAgentSetupVerification.RunCheck(
                qkrpcExe,
                "9.9.9",
                manifest: null,
                manifestPath);

            Assert.IsFalse(result.Ok);
            Assert.IsTrue(result.Issues.Any(i => i.Code == "manifest_missing"));
            Assert.IsTrue(result.NextSteps.Contains("qkrpc agent setup --workspace <path>"));
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [TestMethod]
    public void RunCheck_DetectsOutdatedManifest()
    {
        var temp = Path.Combine(Path.GetTempPath(), "qkrpc-setup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        var qkrpcExe = Path.Combine(temp, "qkrpc.exe");
        File.WriteAllText(qkrpcExe, string.Empty);
        var manifestPath = Path.Combine(temp, "agent-setup.json");
        var manifest = new AgentSetupManifest
        {
            CliVersion = "1.0.0",
            Targets = ["cursor"],
            Skills = ["qkrpc"],
        };

        try
        {
            var result = QkrpcAgentSetupVerification.RunCheck(
                qkrpcExe,
                "2.0.0",
                manifest,
                manifestPath);

            Assert.IsFalse(result.Ok);
            Assert.IsTrue(result.Issues.Any(i => i.Code == "manifest_outdated"));
            Assert.IsTrue(result.NextSteps.Contains("qkrpc agent setup --upgrade"));
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [TestMethod]
    public void RunCheck_DetectsMcpExeMismatch()
    {
        var temp = Path.Combine(Path.GetTempPath(), "qkrpc-setup-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        var configPath = Path.Combine(temp, "mcp.json");
        var oldExe = Path.Combine(temp, "old-qkrpc.exe");
        var newExe = Path.Combine(temp, "new-qkrpc.exe");
        File.WriteAllText(oldExe, string.Empty);
        File.WriteAllText(newExe, string.Empty);

        QkrpcAgentSetupVerification.MergeMcpConfigFile(
            configPath,
            McpConfigFormat.McpServers,
            oldExe,
            temp,
            "1.0.0");

        try
        {
            Assert.IsTrue(QkrpcAgentSetupVerification.TryReadMcpServerEntry(
                configPath,
                McpConfigFormat.McpServers,
                "qkrpc",
                out var entry));
            Assert.AreNotEqual(Path.GetFullPath(newExe), Path.GetFullPath(entry!.Command));
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    [TestMethod]
    public void ProjectTargets_UseWorkspaceRootNotCwd()
    {
        var workspace = @"D:\team\quicker-workspace";
        var targets = McpInstallTarget.ProjectTargets(workspace).ToList();

        Assert.AreEqual(3, targets.Count);
        Assert.AreEqual(
            Path.Combine(workspace, ".cursor", "mcp.json"),
            targets[0].ResolveConfigPath());
        Assert.AreEqual(
            Path.Combine(workspace, ".vscode", "mcp.json"),
            targets[1].ResolveConfigPath());
        Assert.AreEqual(
            Path.Combine(workspace, ".mcp.json"),
            targets[2].ResolveConfigPath());
    }
}
