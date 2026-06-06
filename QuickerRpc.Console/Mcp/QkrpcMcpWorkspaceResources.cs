using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerResourceType]
public sealed class QkrpcMcpWorkspaceResources
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpWorkspaceResources(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerResource(UriTemplate = "quicker://workspace/readme", MimeType = "text/markdown")]
    [Description("On-disk .quicker layout and editing workflow.")]
    public string WorkspaceReadme()
    {
        var root = _runtime.WorkspaceRoot;
        if (!string.IsNullOrWhiteSpace(root))
        {
            QkrpcMcpWorkspaceIndex.EnsureReadme(Path.GetFullPath(root));
        }

        return QkrpcMcpWorkspaceReadme.Content;
    }

    [McpServerResource(UriTemplate = "quicker://workspace/index", MimeType = "application/json")]
    [Description("JSON index of .quicker projects and file paths.")]
    public string WorkspaceIndex()
    {
        var root = _runtime.WorkspaceRoot;
        if (string.IsNullOrWhiteSpace(root))
        {
            return """{"ok":false,"errorMessage":"QKRPC_WORKSPACE_ROOT is not set"}""";
        }

        var workspaceRoot = Path.GetFullPath(root);
        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        return QkrpcMcpWorkspaceIndex.TryRead(workspaceRoot)
            ?? QkrpcMcpJson.FormatObject(QkrpcMcpWorkspaceIndex.Build(workspaceRoot));
    }
}
