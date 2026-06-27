using System;
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

    /// <summary>Current Quicker account (for managed LLM usage fingerprinting).</summary>
    Task<QuickerRpcAccountInfo> GetQuickerAccountAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Bearer token for getquicker.net API (from Quicker <c>RuntimeDataStore.UserInfo.Token</c>).
    /// For Pub5 action-page edits — do not log or paste in chat.
    /// </summary>
    Task<QuickerRpcWebSessionInfo> GetQuickerWebSessionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Refresh a shared action. Forwards to <see cref="PublishSharedActionAsync"/> (same implementation).
    /// </summary>
    Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default);

    /// <summary>Share or refresh a local/shared action on getquicker.net (first publish or update).</summary>
    Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>Validate publish/update prerequisites without uploading.</summary>
    Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default);

    /// <summary>Read getquicker shared-action HTML intro (动作说明) for the logged-in author.</summary>
    Task<QuickerRpcActionDocResult> GetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default);

    /// <summary>Update getquicker shared-action HTML intro (动作说明) for the logged-in author.</summary>
    Task<QuickerRpcActionDocResult> SetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Write action page intro (optional) and submit the shared action for library review
    /// (web Edit?handler=Publish — 保存并发布到动作库).
    /// </summary>
    Task<QuickerRpcActionDocResult> SubmitSharedActionForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default);

    /// <summary>Diagnostics: probe getquicker Detail APIs and edit-form metadata (JSON string).</summary>
    Task<string> ProbeSharedActionDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default);

    /// <summary>Resolve shared action id and obtain temp web-login token (diagnostics / HTTP edit page).</summary>
    Task<QuickerRpcSharedInfoWebSessionResult> PrepareSharedInfoWebSessionAsync(
        string idOrSharedId,
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
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default);

    /// <summary>Create blank global action profile pages (AddProfile on _global).</summary>
    Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default);

    /// <summary>Move existing global profile tabs to sit right after the first global page.</summary>
    Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default);

    /// <summary>Delete empty action profile pages (tabs). Fails when the page still has actions or is protected.</summary>
    Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default);

    /// <summary>Delete all empty, deletable action profile pages under a process scope (e.g. chrome.exe, global).</summary>
    Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Ensure a Quicker virtual process (custom ExeFile tab) exists and optionally move actions
    /// that call <paramref name="collectSubProgramName"/> into its first action page.
    /// </summary>
    Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
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

    /// <summary>
    /// Trace-run an XAction via plugin <c>XActionRunner</c> with <c>IsDebugging</c> and terminal logger
    /// (no Quicker step debugger UI). Pass <paramref name="progress"/> for live event streaming on the same RPC call.
    /// </summary>
    Task<QuickerRpcActionTraceRunResult> RunActionTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Trace-run an ephemeral XAction program JSON (steps/variables) without saving a Quicker action.
    /// </summary>
    Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default);

    /// <summary>Show a local action as a floating button (ActionEditMgr.FloatAction).</summary>
    Task<QuickerRpcFloatActionResult> FloatActionAsync(
        string actionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Edit a variable default value headlessly (patch save).
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

    /// <summary>
    /// Read a shared action program by sharedActionId (memory/SQL/network). Read-only learning copy.
    /// </summary>
    Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search the public getquicker.net action library (HTML parse server-side).</summary>
    Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
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

    /// <summary>Update action title, description, icon, and/or context menu (headless save; does not change program body).</summary>
    Task<QuickerRpcUpdateActionMetadataResult> UpdateActionMetadataAsync(
        string actionId,
        string? title = null,
        string? description = null,
        string? icon = null,
        string? contextMenuData = null,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default);

    /// <summary>Search StepRunner catalog rows for stepRunnerKey selection.</summary>
    Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default);

    /// <summary>List all searchable StepRunner modules (maintainers / UI catalog hydration).</summary>
    Task<QuickerRpcSearchStepRunnersResult> ListStepRunnersAsync(
        int? maxResults = null,
        CancellationToken cancellationToken = default);

    /// <summary>Agent step-runner schema (compressed JSON, no icon). For UI use <see cref="GetStepRunnerUiDetailAsync"/>.</summary>
    Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default);

    /// <summary>UI step-runner schema (full JSON with icon and control options). Not for LLM tools.</summary>
    Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default);

    /// <summary>One-line summaries for action steps via Quicker IStepRunner.GetSummary.</summary>
    Task<QuickerRpcActionStepSummariesResult> GetActionStepSummariesAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default);

    /// <summary>Action-editor quick insert search (pinyin). UI / serve only — not for agents or CLI.</summary>
    Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms,
        CancellationToken cancellationToken = default);

    /// <summary>Action-editor toolbox module search. UI / serve only — not for agents or CLI.</summary>
    Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(
        string? keyword,
        int skip,
        CancellationToken cancellationToken = default);

    /// <summary>Read custom clipboard format text (e.g. quicker-action-steps).</summary>
    Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardSpecialFormatAsync(
        string format,
        CancellationToken cancellationToken = default);

    /// <summary>Write custom clipboard format text (e.g. quicker-action-steps).</summary>
    Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardSpecialFormatAsync(
        string format,
        string text,
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

    /// <summary>Compile-check a Quicker expression ($= / sys:evalexpression) via Z.Expressions.</summary>
    Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionSyntaxAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default);

    /// <summary>Execute a Quicker expression ($= / sys:evalexpression) via Z.Expressions inside Quicker.</summary>
    Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Run one <c>sys:chromecontrol</c> operation against the user's browser (Quicker Connector extension).
    /// Uses the same runtime as action steps — preserves login state and profile cookies.
    /// </summary>
    Task<QuickerRpcChromeControlResult> ExecuteChromeControlAsync(
        string operation,
        string? parametersJson = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default);

    /// <summary>List open browser tabs connected to Quicker (Chrome/Edge/Firefox extension).</summary>
    Task<QuickerRpcChromeControlTabsResult> ListBrowserTabsAsync(
        CancellationToken cancellationToken = default);

    /// <summary>Compile-check a sys:csscript C# snippet (Roslyn / Westwind, requires Exec method).</summary>
    Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptSyntaxAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default);

    /// <summary>Search Quicker settings catalog and settings pages by keyword.</summary>
    Task<QuickerRpcSearchSettingsResult> SearchSettingsAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default);

    /// <summary>List known Quicker setting keys (optionally filtered by scope).</summary>
    Task<QuickerRpcListSettingsResult> ListSettingsAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default);

    /// <summary>Read a Quicker setting value by key (scope:path, e.g. userSettings:EnableCircleMenu).</summary>
    Task<QuickerRpcGetSettingResult> GetSettingAsync(
        string key,
        CancellationToken cancellationToken = default);

    /// <summary>Update a Quicker setting value and persist it.</summary>
    Task<QuickerRpcSetSettingResult> SetSettingAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default);

    /// <summary>Update multiple Quicker settings in one call (continues on partial failure).</summary>
    Task<QuickerRpcApplySettingsResult> ApplySettingsAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default);

    /// <summary>List openable Quicker settings pages and UI targets.</summary>
    Task<QuickerRpcListSettingsPagesResult> ListSettingsPagesAsync(
        CancellationToken cancellationToken = default);

    /// <summary>List preset direct links for one-step settings UI open.</summary>
    Task<QuickerRpcListSettingsDirectLinksResult> ListSettingsDirectLinksAsync(
        CancellationToken cancellationToken = default);

    /// <summary>Open a Quicker settings page or related UI (search, exe-settings, etc.).</summary>
    /// <param name="target">Page id or alias (e.g. AppSettings, recycle-bin, search).</param>
    /// <param name="exeFile">Required for exe-settings / process-settings.</param>
    /// <param name="searchText">Prefill text when opening the Quicker search window.</param>
    /// <param name="query">When <paramref name="target"/> is empty: keyword search for a settings page to open.</param>
    /// <param name="settingKey">When <paramref name="target"/> is empty: open the page that contains this setting key.</param>
    /// <param name="preset">Preset direct link id or alias (e.g. hotkeys, recycle-bin) — preferred one-step open.</param>
    Task<QuickerRpcOpenSettingsUiResult> OpenSettingsUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default);

    /// <summary>Dry-run: resolve user query/preset/key to settings UI or headless target without opening UI.</summary>
    Task<QuickerRpcResolveSettingsIntentResult> ResolveSettingsIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Unified launcher resolve: search settings/actions/subprograms, score, rank candidates for agent pick.
    /// </summary>
    /// <param name="scopes">Optional filter: settings, actions, subprograms (comma-separated).</param>
    Task<QuickerRpcResolveLauncherIntentResult> ResolveLauncherIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default);

    /// <summary>List configured event trigger tasks (automation rules in UserSettings.TriggerTasks).</summary>
    Task<QuickerRpcTriggerListResult> ListTriggersAsync(
        string? query = null,
        string? eventType = null,
        CancellationToken cancellationToken = default);

    /// <summary>List supported trigger event types with accepted params and event variables.</summary>
    Task<QuickerRpcTriggerEventTypesResult> ListTriggerEventTypesAsync(
        string? eventType = null,
        CancellationToken cancellationToken = default);

    /// <summary>Create or update an event trigger task. Empty Id = create; null fields keep existing values.</summary>
    Task<QuickerRpcTriggerSaveResult> SaveTriggerAsync(
        QuickerRpcTriggerTaskInfo task,
        CancellationToken cancellationToken = default);

    /// <summary>Delete an event trigger task by id.</summary>
    Task<QuickerRpcTriggerDeleteResult> DeleteTriggerAsync(
        string id,
        CancellationToken cancellationToken = default);

    /// <summary>Enable or disable an event trigger task.</summary>
    Task<QuickerRpcTriggerSaveResult> SetTriggerEnabledAsync(
        string id,
        bool enabled,
        CancellationToken cancellationToken = default);

    /// <summary>Diagnostics for background agent search index builds (action/subprogram regions).</summary>
    Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default);

    /// <summary>Invalidate and rebuild search index. region: action, subprogram, or all (default).</summary>
    Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Snapshot of open ActionDesigner windows (entity id, selected steps, optional XAction JSON).
    /// Designed for the embedded QuickerAgent chat (designer AI tab) to read designer context.
    /// </summary>
    Task<QuickerRpcDesignerContextResult> GetActionDesignerContextAsync(
        bool includeXAction = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Run one Quicker param-editor text tool (TextToolType name) and return selected text.
    /// Used by the web action designer when native/Electron pickers are unavailable.
    /// </summary>
    Task<QuickerRpcTextToolRunResult> RunTextToolAsync(
        string toolId,
        string? currentValue = null,
        int timeoutSeconds = 300,
        CancellationToken cancellationToken = default);
}

/// <summary>Result of <see cref="IQuickerRpcService.RunTextToolAsync"/>.</summary>
public sealed class QuickerRpcTextToolRunResult
{
    public bool Ok { get; set; }

    public bool Cancelled { get; set; }

    public string? Value { get; set; }

    public string? Message { get; set; }

    public string? ErrorCode { get; set; }
}

/// <summary>One step currently selected in an open designer step list.</summary>
public sealed class QuickerRpcDesignerSelectedStep
{
    /// <summary>Zero-based index in the visible step list.</summary>
    public int Index { get; set; }

    public string? StepId { get; set; }

    public string? StepRunnerKey { get; set; }

    public string? Note { get; set; }

    public bool Disabled { get; set; }
}

/// <summary>Context of one open ActionDesigner window.</summary>
public sealed class QuickerRpcDesignerWindowContext
{
    /// <summary>Action id or global subprogram id being edited.</summary>
    public string? EntityId { get; set; }

    public bool IsSubProgram { get; set; }

    /// <summary>True for the focused designer window.</summary>
    public bool IsActive { get; set; }

    public string? Title { get; set; }

    /// <summary>Full XAction JSON (info + program); only set when includeXAction is true.</summary>
    public string? XActionJson { get; set; }

    public IList<QuickerRpcDesignerSelectedStep> SelectedSteps { get; set; } =
        new List<QuickerRpcDesignerSelectedStep>();
}

public sealed class QuickerRpcDesignerContextResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public IList<QuickerRpcDesignerWindowContext> Designers { get; set; } =
        new List<QuickerRpcDesignerWindowContext>();
}

public sealed class QuickerRpcSearchIndexRegionStatus
{
    public string Region { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public long Generation { get; set; }

    public long? BuildStartedUtcMs { get; set; }

    public long? BuildCompletedUtcMs { get; set; }

    public long? LastBuildDurationMs { get; set; }

    public int? DocumentCount { get; set; }
}

public sealed class QuickerRpcSearchIndexStatusResult
{
    public bool Ok { get; set; } = true;

    public IList<QuickerRpcSearchIndexRegionStatus> Regions { get; set; } =
        new List<QuickerRpcSearchIndexRegionStatus>();
}

public sealed class QuickerRpcSearchIndexRebuildResult
{
    public bool Ok { get; set; } = true;

    public string? Message { get; set; }
}

public sealed class QuickerRpcSettingsPageInfo
{
    public string Target { get; set; } = string.Empty;

    public string? PageId { get; set; }

    public string? Title { get; set; }

    public string? Snippet { get; set; }

    public string? Keywords { get; set; }

    public IList<string> Aliases { get; set; } = new List<string>();
}

public sealed class QuickerRpcListSettingsPagesResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public IList<QuickerRpcSettingsPageInfo> Pages { get; set; } = new List<QuickerRpcSettingsPageInfo>();
}

public sealed class QuickerRpcOpenSettingsUiResult
{
    public bool Ok { get; set; }

    public string Target { get; set; } = string.Empty;

    public string? PageId { get; set; }

    /// <summary>Preset direct link id when opened via --preset.</summary>
    public string? PresetId { get; set; }

    public string Message { get; set; } = string.Empty;
}

public sealed class QuickerRpcResolveSettingsIntentResult
{
    public bool Ok { get; set; }

    /// <summary>open-ui | open-search | open-exe-settings | open-settings | headless-setting | unknown</summary>
    public string Intent { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public string? PageId { get; set; }

    public string? PresetId { get; set; }

    public string? SettingKey { get; set; }

    public string? SearchText { get; set; }

    /// <summary>Suggested quicker_settings action: open | search | get | set.</summary>
    public string? SuggestedAction { get; set; }

    public string Message { get; set; } = string.Empty;
}

/// <summary>One ranked launcher resolve candidate.</summary>
public sealed class QuickerRpcLauncherIntentCandidate
{
    /// <summary>settings-intent | settings-preset | settings-page | settings-key | action | subprogram</summary>
    public string Kind { get; set; } = string.Empty;

    public int Score { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Subtitle { get; set; }

    public string? Intent { get; set; }

    public string? PageId { get; set; }

    public string? PresetId { get; set; }

    public string? SettingKey { get; set; }

    public string? ActionId { get; set; }

    public string? SubProgramId { get; set; }

    public string? Target { get; set; }

    /// <summary>Agent tool id, e.g. quicker_settings, qkrpc_action.</summary>
    public string SuggestedTool { get; set; } = string.Empty;

    /// <summary>JSON-serializable suggested tool input (action/open params).</summary>
    public string? SuggestedInputJson { get; set; }

    public string? Reason { get; set; }

    /// <summary>Which <c>|</c> query segment produced this candidate.</summary>
    public string? MatchedQueryTerm { get; set; }

    /// <summary>Human-readable match attribution, e.g. title: 功能快捷键.</summary>
    public string? MatchedOn { get; set; }
}

public sealed class QuickerRpcResolveLauncherIntentResult
{
    public bool Ok { get; set; }

    public string Query { get; set; } = string.Empty;

    public string? NormalizedQuery { get; set; }

    /// <summary>Parsed <c>|</c> alternatives from <see cref="Query"/>.</summary>
    public IList<string> QueryTerms { get; set; } = new List<string>();

    /// <summary>Query terms that matched no candidate.</summary>
    public IList<string> MissedTerms { get; set; } = new List<string>();

    public string Message { get; set; } = string.Empty;

    public IList<QuickerRpcLauncherIntentCandidate> Candidates { get; set; } =
        new List<QuickerRpcLauncherIntentCandidate>();
}

public sealed class QuickerRpcSettingsDirectLinkInfo
{
    public string Id { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public IList<string> Aliases { get; set; } = new List<string>();

    public bool RequiresExe { get; set; }

    public string? DefaultExe { get; set; }
}

public sealed class QuickerRpcListSettingsDirectLinksResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public IList<QuickerRpcSettingsDirectLinkInfo> Links { get; set; } = new List<QuickerRpcSettingsDirectLinkInfo>();
}

public sealed class QuickerRpcSettingCatalogItem
{
    public string Key { get; set; } = string.Empty;

    public string Scope { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public bool Writable { get; set; } = true;

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Snippet { get; set; }

    public string? PageId { get; set; }

    public string? PageTitle { get; set; }

    public string? Keywords { get; set; }
}

public sealed class QuickerRpcSettingPageSummary
{
    public string PageId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Keywords { get; set; }
}

public sealed class QuickerRpcSearchSettingsResult
{
    public bool Ok { get; set; }

    public string Query { get; set; } = string.Empty;

    public string? Message { get; set; }

    public IList<QuickerRpcSettingCatalogItem> Items { get; set; } = new List<QuickerRpcSettingCatalogItem>();

    public IList<QuickerRpcSettingPageSummary> Pages { get; set; } = new List<QuickerRpcSettingPageSummary>();
}

public sealed class QuickerRpcListSettingsResult
{
    public bool Ok { get; set; }

    public string? Scope { get; set; }

    public string? Message { get; set; }

    public IList<QuickerRpcSettingCatalogItem> Items { get; set; } = new List<QuickerRpcSettingCatalogItem>();
}

public sealed class QuickerRpcGetSettingResult
{
    public bool Ok { get; set; }

    public string Key { get; set; } = string.Empty;

    public string? Scope { get; set; }

    public string? Path { get; set; }

    public string? ExeFile { get; set; }

    public string? Type { get; set; }

    public string? Value { get; set; }

    public string? Message { get; set; }
}

public sealed class QuickerRpcSetSettingResult
{
    public bool Ok { get; set; }

    public string Key { get; set; } = string.Empty;

    public string? Type { get; set; }

    public string? Value { get; set; }

    public string Message { get; set; } = string.Empty;
}

public sealed class QuickerRpcSettingChangeItem
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;
}

public sealed class QuickerRpcApplySettingsResult
{
    public bool Ok { get; set; }

    public string? Message { get; set; }

    public int AppliedCount { get; set; }

    public int FailedCount { get; set; }

    public IList<QuickerRpcSetSettingResult> Results { get; set; } = new List<QuickerRpcSetSettingResult>();
}

public sealed class QuickerRpcCodeSyntaxCheckResult
{
    public bool Ok { get; set; }

    public bool Success { get; set; }

    /// <summary>expression | csharp</summary>
    public string? Kind { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ErrorCode { get; set; }
}

public sealed class QuickerRpcExpressionExecuteResult
{
    public bool Ok { get; set; }

    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ErrorCode { get; set; }

    /// <summary>JSON-serialized expression return value (last statement), if any.</summary>
    public string? ResultJson { get; set; }

    public string? ResultType { get; set; }

    /// <summary>JSON object: action variable keys updated during execution (includes inputs).</summary>
    public string? VariablesJson { get; set; }
}

public sealed class QuickerRpcChromeControlResult
{
    public bool Ok { get; set; }

    /// <summary>Step operation succeeded (browser extension returned success).</summary>
    public bool Success { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ErrorCode { get; set; }

    public string? Operation { get; set; }

    /// <summary>Pass to subsequent calls to reuse browser/tab context.</summary>
    public string? SessionId { get; set; }

    public int? TabId { get; set; }

    public int? WindowId { get; set; }

    public string? Url { get; set; }

    public string? Title { get; set; }

    public string? Browser { get; set; }

    /// <summary>Primary script/extension payload (JSON).</summary>
    public string? RawResponseJson { get; set; }

    /// <summary>All step output keys captured as JSON object.</summary>
    public string? OutputsJson { get; set; }
}

public sealed class QuickerRpcChromeControlTabItem
{
    public int TabId { get; set; }

    public int WindowId { get; set; }

    public string? Title { get; set; }

    public string? Url { get; set; }

    public string? Status { get; set; }

    public string? Browser { get; set; }

    public int BrowserProcId { get; set; }

    public bool Incognito { get; set; }
}

public sealed class QuickerRpcChromeControlTabsResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ErrorCode { get; set; }

    public IList<QuickerRpcChromeControlTabItem> Items { get; set; } =
        new List<QuickerRpcChromeControlTabItem>();
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

    /// <summary>Quicker icon spec (fa:Light_* or res: URL).</summary>
    public string? Icon { get; set; }
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

    /// <summary>Shared action library id when the action has been shared/published.</summary>
    public string? SharedActionId { get; set; }

    /// <summary>Installed shared action id from the action library (UseTemplate / TemplateId).</summary>
    public string? TemplateId { get; set; }

    /// <summary>Install origin: local | library | published.</summary>
    public string? Source { get; set; }

    /// <summary>Quicker icon spec (fa:Light_* or res: URL).</summary>
    public string? Icon { get; set; }
}

public sealed class QuickerRpcActionUpdateResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }
}

public sealed class QuickerRpcActionPublishRequest
{
    public string? Title { get; set; }

    public string? Description { get; set; }

    /// <summary>Deprecated getquicker 「备注」 field; ignored and rejected by readiness when set.</summary>
    public string? Note { get; set; }

    /// <summary>
    /// Action page intro HTML (getquicker edit page SharedActionVm.Detail). Required for public
    /// publish with review submission; written via the web edit form before submitting for review.
    /// </summary>
    public string? DetailHtml { get; set; }

    public string? Tags { get; set; }

    public string? Keywords { get; set; }

    public string? ChangeLog { get; set; }

    public bool IsPublic { get; set; } = true;

    public bool SubmitReview { get; set; } = true;
}

public sealed class QuickerRpcActionPublishResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    /// <summary>Local action id.</summary>
    public string? ActionId { get; set; }

    /// <summary>Shared action library id on getquicker.net.</summary>
    public string? SharedActionId { get; set; }

    public string? ShareUrl { get; set; }

    public int Revision { get; set; }

    public bool IsPublic { get; set; }

    /// <summary>publish = first share; update = refresh existing share.</summary>
    public string? Mode { get; set; }

    /// <summary>True when the share was auto-submitted for library review (web edit form handler=Publish).</summary>
    public bool ReviewSubmitted { get; set; }

    /// <summary>Structured validation issues when <see cref="Ok"/> is false.</summary>
    public IReadOnlyList<QuickerRpcActionPublishIssue>? Issues { get; set; }
}

public sealed class QuickerRpcMoveActionChoice
{
    public string Id { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public string? Description { get; set; }
}

public sealed class QuickerRpcMoveActionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    /// <summary>True when the caller must pick a resolution (retry with onNoEmptySlot / onOccupiedSlot / swap).</summary>
    public bool NeedsUserChoice { get; set; }

    /// <summary>no_empty_slot | occupied_slot</summary>
    public string? ConflictReason { get; set; }

    public IList<QuickerRpcMoveActionChoice> Choices { get; set; } = new List<QuickerRpcMoveActionChoice>();

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

    public string? OccupiedActionId { get; set; }

    public string? OccupiedActionTitle { get; set; }

    public bool CreatedProfile { get; set; }

    public string? CreatedProfileId { get; set; }

    public string? CreatedProfileName { get; set; }

    /// <summary>When the move emptied the source page, qkrpc auto-deletes it when allowed.</summary>
    public bool DeletedSourceProfile { get; set; }

    public string? DeletedSourceProfileId { get; set; }

    public string? DeletedSourceProfileName { get; set; }

    /// <summary>True when an existing empty/sibling page was reused instead of creating a new tab.</summary>
    public bool ReusedProfile { get; set; }

    public string? ReusedProfileId { get; set; }

    public string? ReusedProfileName { get; set; }
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

    /// <summary>Runtime/step error when waitForComplete is true and the action did not finish successfully.</summary>
    public string? ErrorMessage { get; set; }

    /// <summary>ActionStopFlag name when execution stopped abnormally (e.g. OperationFailed).</summary>
    public string? StopFlag { get; set; }
}

public sealed class QuickerRpcFloatActionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? ActionId { get; set; }

    public string? ActionTitle { get; set; }
}

public sealed class QuickerRpcCreateGlobalProfilesResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? InsertAfterProfileId { get; set; }

    public string? InsertAfterProfileName { get; set; }

    public IList<QuickerRpcCreatedProfileItem> Items { get; set; } = new List<QuickerRpcCreatedProfileItem>();
}

public sealed class QuickerRpcCreatedProfileItem
{
    public string ProfileId { get; set; } = string.Empty;

    public string ProfileName { get; set; } = string.Empty;

    public int ListOrder { get; set; }
}

public sealed class QuickerRpcDeleteProfileResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public IList<QuickerRpcDeletedProfileItem> Deleted { get; set; } = new List<QuickerRpcDeletedProfileItem>();

    public IList<QuickerRpcDeleteProfileFailure> Failures { get; set; } = new List<QuickerRpcDeleteProfileFailure>();
}

public sealed class QuickerRpcDeletedProfileItem
{
    public string ProfileId { get; set; } = string.Empty;

    public string ProfileName { get; set; } = string.Empty;

    public string? ExeFile { get; set; }
}

public sealed class QuickerRpcDeleteProfileFailure
{
    public string ProfileRef { get; set; } = string.Empty;

    public string? ProfileId { get; set; }

    public string? ProfileName { get; set; }

    public int ActionCount { get; set; }

    public string Message { get; set; } = string.Empty;
}

public sealed class QuickerRpcCreateVirtualProcessResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string ExeFile { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string? Scope { get; set; }

    public string? ProfileId { get; set; }

    public string? ProfileName { get; set; }

    public bool CreatedProcess { get; set; }

    public bool CreatedProfile { get; set; }

    public bool InExeSettingsDict { get; set; }

    public IList<QuickerRpcMovedActionItem> MovedActions { get; set; } = new List<QuickerRpcMovedActionItem>();
}

public sealed class QuickerRpcMovedActionItem
{
    public string ActionId { get; set; } = string.Empty;

    public string ActionTitle { get; set; } = string.Empty;

    public string SourceProfileName { get; set; } = string.Empty;

    public int TargetRow { get; set; }

    public int TargetCol { get; set; }
}

public sealed class QuickerRpcAccountInfo
{
    public bool Ok { get; set; } = true;

    public bool LoggedIn { get; set; }

    public string? UserId { get; set; }

    public string? UserName { get; set; }

    public string? NickName { get; set; }

    public string? Message { get; set; }
}

public sealed class QuickerRpcWebSessionInfo
{
    public bool Ok { get; set; } = true;

    public bool LoggedIn { get; set; }

    public string? UserId { get; set; }

    /// <summary>Bearer token for getquicker.net (same as WebConnector).</summary>
    public string? Token { get; set; }

    public DateTime? TokenExpireTimeUtc { get; set; }

    public string? Message { get; set; }
}

public sealed class QuickerRpcSharedInfoWebSessionResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? SharedActionId { get; set; }

    public string? TempToken { get; set; }
}

public sealed class QuickerRpcActionDocResult
{
    public bool Ok { get; set; }

    public string Message { get; set; } = string.Empty;

    public string? SharedActionId { get; set; }

    /// <summary>HTML intro body (get only).</summary>
    public string? Html { get; set; }
}
