using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpWorkspaceTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpWorkspaceTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "workspace_program")]
    [Description(
        "Quicker workspace sync — NOT file editing. "
        + "Edit .quicker/.../data.json and files/ with your host Read/Write/StrReplace tools. "
        + "Layout: MCP resource quicker://workspace/readme or docs get topic=workspace-editing. "
        + "actions: projects_list | reindex | patch | validate | diagnostics. "
        + "pull: qkrpc_action_get / qkrpc_subprogram_get.")]
    public Task<string> WorkspaceProgram(
        string action,
        string? target = null,
        string? id = null,
        string? subProgramId = null,
        bool force = false,
        long? editVersion = null,
        int? waitMs = null,
        CancellationToken cancellationToken = default) =>
        new WorkspaceProgramMcpService(_runtime).ExecuteAsync(
            action, target, id, subProgramId, force, editVersion, waitMs, cancellationToken);
}
