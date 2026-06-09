namespace QuickerRpc.AgentModel.Mcp;

/// <summary>
/// MCP tool ids for third-party agents (subset of <c>agent-gui/lib/tool-registry.ts</c>).
/// Disk file edits use the host agent's file tools — not MCP.
/// </summary>
public static class QkrpcMcpToolCatalog
{
    public static readonly string[] AuthoringToolIds =
    [
        "qkrpc_health",
        "qkrpc_wait",
        "docs",
        "workspace_program",
        "qkrpc_action_query",
        "qkrpc_action_get",
        "qkrpc_action_create",
        "qkrpc_action_edit",
        "qkrpc_action_edit_var",
        "qkrpc_action_set_metadata",
        "qkrpc_action_move",
        "qkrpc_action_publish",
        "qkrpc_action_run",
        "qkrpc_action_debug",
        "qkrpc_action_float",
        "qkrpc_action_delete",
        "qkrpc_profile_create",
        "qkrpc_profile_delete",
        "qkrpc_profile_prune",
        "qkrpc_profile_reorder",
        "qkrpc_process_ensure",
        "qkrpc_subprogram_query",
        "qkrpc_subprogram_get",
        "qkrpc_subprogram_create",
        "qkrpc_subprogram_export",
        "qkrpc_subprogram_import",
        "qkrpc_subprogram_edit",
        "qkrpc_subprogram_delete",
        "qkrpc_step_runner_search",
        "qkrpc_step_runner_get",
        "qkrpc_fa",
        "quicker_settings",
    ];
}
