using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// JSON-RPC surface exposed by the QuickerRpc plugin (StreamJsonRpc over named pipe).
/// </summary>
public interface IQuickerRpcService
{
    /// <summary>Echo check for connectivity.</summary>
    Task<string> PingAsync(CancellationToken cancellationToken = default);

    /// <summary>Bump when breaking RPC contract changes.</summary>
    Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default);

    /// <summary>Upload / refresh a shared action in Quicker (same as ActionEditMgr.UpdateSharedActionAsync).</summary>
    Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search local Quicker actions by keyword (same scoring as the main search box).</summary>
    Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default);

    /// <summary>Search global (public) subprograms by id, name, or description.</summary>
    Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default);

    /// <summary>Delete a local Quicker action (ActionEditMgr.DeleteAction).</summary>
    Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default);

    /// <summary>Open the Quicker action editor for a local action id.</summary>
    Task<QuickerRpcActionUpdateResult> EditActionAsync(
        string actionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Edit a variable default value and save via ActionDesignerWindow.
    /// Accepts a global subprogram id/name or a local action id.
    /// </summary>
    Task<QuickerRpcSubProgramVariableEditResult> EditGlobalSubProgramVariableAsync(
        string subProgramIdOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default);
}

public sealed class QuickerRpcSubProgramVariableEditResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    /// <summary>subprogram | action</summary>
    public string? TargetKind { get; set; }

    /// <summary>Global subprogram id/name or local action id.</summary>
    public string? SubProgramIdOrName { get; set; }

    public string? VariableKey { get; set; }

    public string? OldValue { get; set; }

    public string? NewValue { get; set; }
}

public sealed class QuickerRpcActionSearchResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public IList<QuickerRpcActionSummary> Items { get; set; } = new List<QuickerRpcActionSummary>();
}

public sealed class QuickerRpcSubProgramSearchResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public IList<QuickerRpcSubProgramSummary> Items { get; set; } = new List<QuickerRpcSubProgramSummary>();
}

public sealed class QuickerRpcSubProgramSummary
{
    /// <summary>Global subprogram id; pass to EditGlobalSubProgramVariableAsync.</summary>
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public int Score { get; set; }

    /// <summary>Shared subprogram library id when the subprogram has been shared.</summary>
    public string? SharedId { get; set; }
}

public sealed class QuickerRpcActionSummary
{
    /// <summary>Local action instance id; pass to UpdateSharedActionAsync.</summary>
    public string Id { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? PageTitle { get; set; }

    public int Score { get; set; }

    /// <summary>Shared action library id when the action has been shared.</summary>
    public string? SharedActionId { get; set; }
}

public sealed class QuickerRpcActionUpdateResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }
}
