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

    /// <summary>Search or list recent local actions for agent workflows.</summary>
    Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search local Quicker actions by keyword (same scoring as the main search box).</summary>
    Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search global (public) subprograms by id, name, or description.</summary>
    Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default);

    /// <summary>List or search global subprograms (empty query lists all).</summary>
    Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default);

    /// <summary>Create a new global (public) subprogram.</summary>
    Task<QuickerRpcCreateSubProgramResult> CreateGlobalSubProgramAsync(
        string name,
        string? description = null,
        string? icon = null,
        CancellationToken cancellationToken = default);

    /// <summary>Read a global subprogram by id or name (compressed agent shape).</summary>
    Task<QuickerRpcGetCompressedSubProgramResult> GetCompressedSubProgramAsync(
        string subProgramIdOrName,
        string? returnMode = null,
        CancellationToken cancellationToken = default);

    /// <summary>Apply a partial program patch to a global subprogram (headless save).</summary>
    Task<QuickerRpcApplySubProgramPatchResult> ApplySubProgramPatchAsync(
        string subProgramIdOrName,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Replace steps/variables on a global subprogram (headless save).</summary>
    Task<QuickerRpcApplySubProgramPatchResult> ApplyProgramToSubProgramAsync(
        string subProgramIdOrName,
        string programJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Open the Quicker subprogram editor for a global subprogram.</summary>
    Task<QuickerRpcActionUpdateResult> EditGlobalSubProgramAsync(
        string subProgramIdOrName,
        CancellationToken cancellationToken = default);

    /// <summary>Delete a global subprogram.</summary>
    Task<QuickerRpcActionUpdateResult> DeleteGlobalSubProgramAsync(
        string subProgramIdOrName,
        bool skipConfirm = true,
        CancellationToken cancellationToken = default);

    /// <summary>Delete a local Quicker action (ActionEditMgr.DeleteAction).</summary>
    Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default);

    /// <summary>Move a local Quicker action to another profile, optionally swapping with the target slot.</summary>
    Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Create a new local XAction on an auto-managed virtual action page
    /// (creates virtual process/page slots as needed).
    /// </summary>
    Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default);

    /// <summary>Open the Quicker action editor for a local action id.</summary>
    Task<QuickerRpcActionUpdateResult> EditActionAsync(
        string actionId,
        CancellationToken cancellationToken = default);

    /// <summary>Run a local Quicker action by id or name (AppServer.ExecuteActionByIdOrName).</summary>
    Task<QuickerRpcActionRunResult> RunActionAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default);

    /// <summary>Show a local action as a floating button (ActionEditMgr.FloatAction).</summary>
    Task<QuickerRpcFloatActionResult> FloatActionAsync(
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

    /// <summary>Read a persisted XAction by local action id (compressed agent shape).</summary>
    Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(
        string actionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default);

    /// <summary>Replace steps/variables on a local XAction (headless save).</summary>
    Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(
        string actionId,
        string xActionJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Apply a partial program patch to a local XAction (headless save).</summary>
    Task<QuickerRpcApplyActionPatchResult> ApplyActionPatchToActionAsync(
        string actionId,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Update action title, description, and/or icon (headless save; does not change program body).</summary>
    Task<QuickerRpcUpdateActionMetadataResult> UpdateActionMetadataAsync(
        string actionId,
        string? title = null,
        string? description = null,
        string? icon = null,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Search StepRunner catalog rows for stepRunnerKey selection.</summary>
    Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default);

    /// <summary>Get StepRunner schema for authoring ActionStep inputParams.</summary>
    Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search Font Awesome icons. Default: Light_* + Brands_*; expand returns all style rows.</summary>
    Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default);

    /// <summary>Resolve fa: specs to SVG path data (FontAwesome5 catalog in Quicker).</summary>
    Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
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

    public string? Scope { get; set; }

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

    /// <summary>Value for sys:subprogram step inputParams.subProgram (from subprogram get/search).</summary>
    public string? CallIdentifier { get; set; }
}

public sealed class QuickerRpcActionSummary
{
    /// <summary>Local action instance id; pass to UpdateSharedActionAsync.</summary>
    public string Id { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? PageTitle { get; set; }

    /// <summary>Action page / profile id.</summary>
    public string? ProfileId { get; set; }

    /// <summary>Action page name (e.g. @qkrpc 001, _default).</summary>
    public string? ProfileName { get; set; }

    /// <summary>Process/scene key (e.g. chrome.exe, _global, common).</summary>
    public string? ExeFile { get; set; }

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

public sealed class QuickerRpcMoveActionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ActionTitle { get; set; }

    public string? SourceProfileId { get; set; }

    public string? SourceProfileName { get; set; }

    public int SourceRow { get; set; }

    public int SourceCol { get; set; }

    public string? TargetProfileId { get; set; }

    public string? TargetProfileName { get; set; }

    public int TargetRow { get; set; }

    public int TargetCol { get; set; }

    public string? SwappedActionId { get; set; }

    public string? SwappedActionTitle { get; set; }
}

public sealed class QuickerRpcCreateActionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ProfileId { get; set; }

    public string? ProfileName { get; set; }

    public string? ExeFile { get; set; }

    public int Row { get; set; }

    public int Col { get; set; }

    public long EditVersion { get; set; }

    /// <summary>True when a new virtual action page was created for this action.</summary>
    public bool CreatedProfile { get; set; }

    public bool IsVirtual { get; set; }
}

public sealed class QuickerRpcActionRunResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ActionTitle { get; set; }

    /// <summary>Action return value when waitForComplete is true.</summary>
    public string? ReturnResult { get; set; }
}

public sealed class QuickerRpcFloatActionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ActionTitle { get; set; }
}
