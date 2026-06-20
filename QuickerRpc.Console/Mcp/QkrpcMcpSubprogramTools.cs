using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpSubprogramTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpSubprogramTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_subprogram_query")]
    [Description(
        "List/search global subprograms. Empty query = list all. "
        + "Query prefixes (same as qkrpc_action_query): uses:<idOrName> / uses-only:<idOrName> "
        + "find subprograms calling the target; source:published|local, shared:<sharedId> filter by share state.")]
    public Task<string> QkrpcSubprogramQuery(
        string? query = null,
        int? limit = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.QueryAsync(_runtime, query, limit, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_get")]
    [Description(
        "Sync one global subprogram to .quicker/subprograms/ (first time). "
        + "When Action Designer is open, reads in-memory draft (readSource=action-designer). "
        + "Pulls .quicker/subprograms/. Edit disk with host file tools → workspace_program patch.")]
    public Task<string> QkrpcSubprogramGet(
        string id,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.GetAsync(_runtime, id, returnMode, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_create")]
    [Description(
        "Create a new global subprogram and bootstrap .quicker/subprograms/{id}/. "
        + "Optional dataJson: { steps, variables } writes program body directly. "
        + "Edit .quicker/ with host file tools → workspace_program patch.")]
    public Task<string> QkrpcSubprogramCreate(
        string name,
        string? description = null,
        string? icon = null,
        string? dataJson = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.CreateAsync(_runtime, name, description, icon, dataJson, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_export")]
    [Description("Export subprogram to a directory path.")]
    public Task<string> QkrpcSubprogramExport(
        string id,
        string dir,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.ExportAsync(_runtime, id, dir, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_import")]
    [Description("Import subprogram from directory. Normal disk workflow: edit .quicker/ then workspace_program patch.")]
    public Task<string> QkrpcSubprogramImport(
        string dir,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.ImportAsync(_runtime, dir, expectedEditVersion, force, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_edit")]
    [Description("Open subprogram in Quicker desktop UI.")]
    public Task<string> QkrpcSubprogramEdit(string id, CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.EditAsync(_runtime, id, cancellationToken);

    [McpServerTool(Name = "qkrpc_subprogram_delete")]
    [Description("Permanently delete a global subprogram. Destructive — only when user explicitly asked.")]
    public Task<string> QkrpcSubprogramDelete(string id, CancellationToken cancellationToken = default) =>
        QkrpcMcpSubprogramExecutor.DeleteAsync(_runtime, id, cancellationToken);

}
