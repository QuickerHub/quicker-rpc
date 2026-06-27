using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class QkrpcMcpWorkspaceResolverTests
{
    [TestMethod]
    public void ResolveFromEnvironment_PrefersExplicitWorkspaceRoot()
    {
        var temp = CreateTempDir();
        var other = CreateTempDir();
        try
        {
            Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", temp);
            Environment.SetEnvironmentVariable("WORKSPACE_FOLDER_PATHS", other);
            Environment.SetEnvironmentVariable("QKRPC_CWD", other);

            var resolved = QkrpcMcpWorkspaceResolver.ResolveFromEnvironment();

            Assert.AreEqual(Path.GetFullPath(temp), resolved);
        }
        finally
        {
            Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", null);
            Environment.SetEnvironmentVariable("WORKSPACE_FOLDER_PATHS", null);
            Environment.SetEnvironmentVariable("QKRPC_CWD", null);
            Directory.Delete(temp, recursive: true);
            Directory.Delete(other, recursive: true);
        }
    }

    [TestMethod]
    public void ResolveFromEnvironment_SkipsWorkspaceFolderPlaceholder()
    {
        var hostPath = CreateTempDir();
        try
        {
            Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", QkrpcMcpWorkspaceResolver.FollowAgentWorkspaceToken);
            Environment.SetEnvironmentVariable("WORKSPACE_FOLDER_PATHS", hostPath);

            var resolved = QkrpcMcpWorkspaceResolver.ResolveFromEnvironment();

            Assert.AreEqual(Path.GetFullPath(hostPath), resolved);
        }
        finally
        {
            Environment.SetEnvironmentVariable("QKRPC_WORKSPACE_ROOT", null);
            Environment.SetEnvironmentVariable("WORKSPACE_FOLDER_PATHS", null);
            Directory.Delete(hostPath, recursive: true);
        }
    }

    [TestMethod]
    public void ResolveMcpEnvWorkspace_FollowModeUsesWorkspaceFolderToken()
    {
        Assert.AreEqual(
            QkrpcMcpWorkspaceResolver.FollowAgentWorkspaceToken,
            QkrpcMcpWorkspaceResolver.ResolveMcpEnvWorkspace(null));
    }

    [TestMethod]
    public void TryParseFileRootUri_ParsesWindowsFileUri()
    {
        Assert.IsTrue(
            QkrpcMcpWorkspaceResolver.TryParseFileRootUri(
                "file:///D:/projects/demo",
                out var root));
        Assert.AreEqual(Path.GetFullPath(@"D:\projects\demo"), root);
    }

    private static string CreateTempDir()
    {
        var path = Path.Combine(Path.GetTempPath(), "qkrpc-workspace-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}
