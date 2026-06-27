using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerResourceType]
public sealed class QkrpcMcpWorkspaceResources
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpWorkspaceResources(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerResource(UriTemplate = "quicker://workspace/readme", MimeType = "text/markdown")]
    [Description(".quicker/ layout; edit files with host tools, then workspace_program patch.")]
    public async Task<string> WorkspaceReadme(CancellationToken cancellationToken)
    {
        var root = await _runtime.TryResolveWorkspaceRootAsync(cancellationToken).ConfigureAwait(false);
        if (!string.IsNullOrWhiteSpace(root))
        {
            QkrpcMcpWorkspaceIndex.EnsureReadme(root);
        }

        return QkrpcMcpWorkspaceReadme.Content;
    }

    [McpServerResource(UriTemplate = "quicker://workspace/index", MimeType = "application/json")]
    [Description("JSON index of .quicker projects and file paths.")]
    public async Task<string> WorkspaceIndex(CancellationToken cancellationToken)
    {
        string workspaceRoot;
        try
        {
            workspaceRoot = await _runtime.ResolveWorkspaceRootAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = ex.Message });
        }

        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        return QkrpcMcpWorkspaceIndex.TryRead(workspaceRoot)
            ?? QkrpcMcpJson.FormatObject(QkrpcMcpWorkspaceIndex.Build(workspaceRoot));
    }
}
