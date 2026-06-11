using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpActionTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpActionTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_action_query")]
    [Description(
        "Find actions by keyword, scope, or uses:SubName. Empty query = recent actions. "
        + "NOT workspace_program; NOT run — use qkrpc_action_run.")]
    public Task<string> QkrpcActionQuery(
        string? query = null,
        string? filter = null,
        string? fields = null,
        string? scope = null,
        int? limit = null,
        string? sort = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.QueryAsync(_runtime, query, filter, fields, scope, limit, sort, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_get")]
    [Description(
        "Sync one action from Quicker to .quicker/actions/{id}/ (first time only). "
        + "Pulls .quicker/ on first get. Edit disk with host file tools → workspace_program patch. NOT run — qkrpc_action_run.")]
    public Task<string> QkrpcActionGet(
        string id,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.GetAsync(_runtime, id, returnMode, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_create")]
    [Description(
        "Create a new Quicker action and bootstrap .quicker/actions/{id}/. "
        + "title required. After create edit .quicker/ with host file tools → workspace_program patch — do not re-get.")]
    public Task<string> QkrpcActionCreate(
        string title,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.CreateAsync(_runtime, title, description, icon, profileId, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_edit")]
    [Description("Open one action in Quicker desktop designer UI.")]
    public Task<string> QkrpcActionEdit(string id, CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.EditAsync(_runtime, id, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_edit_var")]
    [Description("Set one action variable value in Quicker (not disk edit).")]
    public Task<string> QkrpcActionEditVar(
        string id,
        string var,
        string value,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.EditVarAsync(_runtime, id, var, value, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_set_metadata")]
    [Description("Update action title, description, or icon only. Icon: qkrpc_fa search first.")]
    public Task<string> QkrpcActionSetMetadata(
        string id,
        string? title = null,
        string? description = null,
        string? icon = null,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.SetMetadataAsync(
            _runtime, id, title, description, icon, expectedEditVersion, force, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_move")]
    [Description("Move one action on the Quicker action grid (profile + row/col). Default: first empty slot, no swap; on needsUserChoice (occupied / page full) ask the user (e.g. create a new page?) before retrying.")]
    public Task<string> QkrpcActionMove(
        string id,
        string profile,
        int? row = null,
        int? col = null,
        bool swap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.MoveAsync(
            _runtime, id, profile, row, col, swap, onNoEmptySlot, onOccupiedSlot, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_publish")]
    [Description("Publish/share one action to getquicker.net.")]
    public Task<string> QkrpcActionPublish(
        string id,
        string? title = null,
        string? description = null,
        string? note = null,
        string? html = null,
        string? tags = null,
        string? keywords = null,
        string? changelog = null,
        bool? isPublic = null,
        bool? submitReview = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.PublishAsync(
            _runtime, id, title, description, note, html, tags, keywords, changelog, isPublic, submitReview,
            cancellationToken);

    [McpServerTool(Name = "qkrpc_action_run")]
    [Description("Run one action and wait for completion. NOT debug — qkrpc_action_debug.")]
    public Task<string> QkrpcActionRun(
        string id,
        string? param = null,
        bool wait = false,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.RunAsync(_runtime, id, param, wait, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_debug")]
    [Description("Debug one action with step trace — use when step output is needed.")]
    public Task<string> QkrpcActionDebug(
        string id,
        string? param = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.DebugAsync(_runtime, id, param, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_float")]
    [Description("Float one action popup window in Quicker.")]
    public Task<string> QkrpcActionFloat(string id, CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.FloatAsync(_runtime, id, cancellationToken);

    [McpServerTool(Name = "qkrpc_action_delete")]
    [Description("Permanently delete a local Quicker action. Destructive — only when the user explicitly asked.")]
    public Task<string> QkrpcActionDelete(string id, CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.DeleteAsync(_runtime, id, cancellationToken);

    [McpServerTool(Name = "qkrpc_profile_create")]
    [Description("Create new action page tabs (profiles) on the global action grid.")]
    public Task<string> QkrpcProfileCreate(
        int? count = null,
        bool afterFirst = false,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.ProfileCreateAsync(_runtime, count, afterFirst, cancellationToken);

    [McpServerTool(Name = "qkrpc_profile_delete")]
    [Description("Delete one or more action page tabs (profiles). profileIds comma-separated or single id.")]
    public Task<string> QkrpcProfileDelete(
        string? profileIds = null,
        string? profileId = null,
        string? id = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.ProfileDeleteAsync(_runtime, profileIds, profileId, id, cancellationToken);

    [McpServerTool(Name = "qkrpc_profile_prune")]
    [Description("Prune empty action pages for a scope or exe.")]
    public Task<string> QkrpcProfilePrune(
        string? scope = null,
        string? exeFile = null,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.ProfilePruneAsync(_runtime, scope, exeFile, cancellationToken);

    [McpServerTool(Name = "qkrpc_profile_reorder")]
    [Description("Reorder global action page tabs. profileIds comma-separated.")]
    public Task<string> QkrpcProfileReorder(
        string profileIds,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.ProfileReorderAsync(_runtime, profileIds, cancellationToken);

    [McpServerTool(Name = "qkrpc_process_ensure")]
    [Description("Ensure virtual process profiles exist for an exe (action page layout).")]
    public Task<string> QkrpcProcessEnsure(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool moveActions = false,
        bool moveAny = false,
        CancellationToken cancellationToken = default) =>
        QkrpcMcpActionExecutor.ProcessEnsureAsync(
            _runtime, exeFile, displayName, profileNamePrefix, collectSubProgramName, moveActions, moveAny,
            cancellationToken);

}
