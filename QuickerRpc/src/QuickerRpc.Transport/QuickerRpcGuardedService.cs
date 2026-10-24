// Forwarders intentionally implement the whole contract: new RPC methods must pass the same guard.
using System;
using System.IO;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport;

internal sealed class QuickerRpcGuardedService : IQuickerRpcService
{
    private readonly IQuickerRpcService inner;
    private readonly bool server;
    private readonly bool legacyEndpoint;
    private bool handshaken;
    public QuickerRpcHostBinding? Binding { get; private set; }

    public QuickerRpcGuardedService(IQuickerRpcService inner, bool server = false, bool legacyEndpoint = false)
    { this.inner = inner; this.server = server; this.legacyEndpoint = legacyEndpoint; }

    internal void Bind(QuickerRpcHostBinding binding)
    {
        if (Binding is not null) throw new InvalidOperationException("A connection binding cannot change.");
        Binding = binding;
    }

    private async Task<T> InvokeAsync<T>(string method, Func<Task<T>> invoke, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var write = !QuickerRpcMethodPolicy.IsReadOnly(method);
        var requiresBinding = method == nameof(GetStepRunnerInputContractAsync);
        if ((write || requiresBinding) && (server ? legacyEndpoint || !handshaken : Binding is null))
            throw Failure(QuickerRpcBindingErrors.Required, "A verified dedicated host connection is required for this operation.");
        var capability = QuickerRpcMethodPolicy.Capability(method);
        if (Binding is not null && capability is not null && !Binding.Supports(capability))
            throw Failure(QuickerRpcBindingErrors.Unsupported, "Host does not declare capability: " + capability);
        try
        {
            var result = await invoke().ConfigureAwait(false);
            if (server && method == nameof(GetHostSessionAsync) && result is QuickerRpcHostSessionInfo info)
            {
                Binding ??= QuickerRpcHostDiscovery.Verify(info, info.Endpoint);
                handshaken = true;
            }
            return result;
        }
        catch (Exception ex) when (!server && write && (ex is IOException || ex is ConnectionLostException || ex is OperationCanceledException || ex is ObjectDisposedException))
        {
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.UnknownWriteResult,
                "The operation may have been sent; its result is unknown. Inspect the bound host before retrying. " + ex.Message);
        }
    }

    private Exception Failure(string code, string message) => server
        ? new LocalRpcException(message) { ErrorCode = 1001, ErrorData = new { error = code, retryable = false } }
        : new QuickerRpcClientException(code, message);

    public Task<string> PingAsync(CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PingAsync), () => inner.PingAsync(cancellationToken), cancellationToken);

    public Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetProtocolVersionAsync), () => inner.GetProtocolVersionAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetHostSessionAsync), () => inner.GetHostSessionAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcAccountInfo> GetQuickerAccountAsync(CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetQuickerAccountAsync), () => inner.GetQuickerAccountAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcWebSessionInfo> GetQuickerWebSessionAsync(CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetQuickerWebSessionAsync), () => inner.GetQuickerWebSessionAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(UpdateSharedActionAsync), () => inner.UpdateSharedActionAsync(actionId, changeLog, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PublishSharedActionAsync), () => inner.PublishSharedActionAsync(actionId, request, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PreflightPublishSharedActionAsync), () => inner.PreflightPublishSharedActionAsync(actionId, request, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionDocResult> GetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetSharedActionDetailHtmlAsync), () => inner.GetSharedActionDetailHtmlAsync(idOrSharedId, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionDocResult> SetSharedActionDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SetSharedActionDetailHtmlAsync), () => inner.SetSharedActionDetailHtmlAsync(idOrSharedId, htmlContent, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionDocResult> SubmitSharedActionForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SubmitSharedActionForReviewAsync), () => inner.SubmitSharedActionForReviewAsync(idOrSharedId, htmlContent, cancellationToken), cancellationToken);

    public Task<string> ProbeSharedActionDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ProbeSharedActionDetailApisAsync), () => inner.ProbeSharedActionDetailApisAsync(idOrSharedId, cancellationToken), cancellationToken);

    public Task<QuickerRpcSharedInfoWebSessionResult> PrepareSharedInfoWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PrepareSharedInfoWebSessionAsync), () => inner.PrepareSharedInfoWebSessionAsync(idOrSharedId, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchActionSummariesResult> SearchActionSummariesAsync(
        string? query,
        int maxResults = 30,
        string? scope = null,
        string? sort = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchActionSummariesAsync), () => inner.SearchActionSummariesAsync(query, maxResults, scope, sort, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionSearchResult> SearchActionsAsync(
        string query,
        int maxCount = 20,
        string? scope = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchActionsAsync), () => inner.SearchActionsAsync(query, maxCount, scope, cancellationToken), cancellationToken);

    public Task<QuickerRpcSubProgramSearchResult> SearchGlobalSubProgramsAsync(
        string query,
        int maxCount = 20,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchGlobalSubProgramsAsync), () => inner.SearchGlobalSubProgramsAsync(query, maxCount, cancellationToken), cancellationToken);

    public Task<QuickerRpcSubProgramSearchResult> ListGlobalSubProgramsAsync(
        string? query,
        int maxCount = 30,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListGlobalSubProgramsAsync), () => inner.ListGlobalSubProgramsAsync(query, maxCount, cancellationToken), cancellationToken);

    public Task<QuickerRpcCreateSubProgramResult> CreateGlobalSubProgramAsync(
        string name,
        string? description = null,
        string? icon = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(CreateGlobalSubProgramAsync), () => inner.CreateGlobalSubProgramAsync(name, description, icon, cancellationToken), cancellationToken);

    public Task<QuickerRpcGetCompressedSubProgramResult> GetCompressedSubProgramAsync(
        string subProgramIdOrName,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetCompressedSubProgramAsync), () => inner.GetCompressedSubProgramAsync(subProgramIdOrName, returnMode, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplySubProgramPatchResult> ApplySubProgramPatchAsync(
        string subProgramIdOrName,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplySubProgramPatchAsync), () => inner.ApplySubProgramPatchAsync(subProgramIdOrName, patchJson, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplySubProgramPatchResult> ApplyProgramToSubProgramAsync(
        string subProgramIdOrName,
        string programJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplyProgramToSubProgramAsync), () => inner.ApplyProgramToSubProgramAsync(subProgramIdOrName, programJson, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionPublishResult> PublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PublishSharedSubProgramAsync), () => inner.PublishSharedSubProgramAsync(subProgramIdOrName, request, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedSubProgramAsync(
        string subProgramIdOrName,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PreflightPublishSharedSubProgramAsync), () => inner.PreflightPublishSharedSubProgramAsync(subProgramIdOrName, request, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> UpdateSharedSubProgramAsync(
        string subProgramIdOrName,
        string? changeLog = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(UpdateSharedSubProgramAsync), () => inner.UpdateSharedSubProgramAsync(subProgramIdOrName, changeLog, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> EditGlobalSubProgramAsync(
        string subProgramIdOrName,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(EditGlobalSubProgramAsync), () => inner.EditGlobalSubProgramAsync(subProgramIdOrName, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> DeleteGlobalSubProgramAsync(
        string subProgramIdOrName,
        bool skipConfirm = true,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(DeleteGlobalSubProgramAsync), () => inner.DeleteGlobalSubProgramAsync(subProgramIdOrName, skipConfirm, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(DeleteActionAsync), () => inner.DeleteActionAsync(actionId, showConfirm, cancellationToken), cancellationToken);

    public Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(MoveActionAsync), () => inner.MoveActionAsync(actionId, targetProfile, targetRow, targetCol, allowSwap, onNoEmptySlot, onOccupiedSlot, cancellationToken), cancellationToken);

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(CreateGlobalProfilesAsync), () => inner.CreateGlobalProfilesAsync(count, insertAfterFirstPage, cancellationToken), cancellationToken);

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ReorderGlobalProfilesAfterFirstAsync), () => inner.ReorderGlobalProfilesAfterFirstAsync(profileIds, cancellationToken), cancellationToken);

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(DeleteEmptyProfilesAsync), () => inner.DeleteEmptyProfilesAsync(profileIdsOrNames, cancellationToken), cancellationToken);

    public Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(PruneEmptyProfilesAsync), () => inner.PruneEmptyProfilesAsync(scope, cancellationToken), cancellationToken);

    public Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(EnsureVirtualProcessAsync), () => inner.EnsureVirtualProcessAsync(exeFile, displayName, profileNamePrefix, collectSubProgramName, dedicatedSubProgramOnly, cancellationToken), cancellationToken);

    public Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(CreateActionAsync), () => inner.CreateActionAsync(title, description, icon, profileId, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionUpdateResult> EditActionAsync(
        string actionId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(EditActionAsync), () => inner.EditActionAsync(actionId, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionRunResult> RunActionAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(RunActionAsync), () => inner.RunActionAsync(actionId, inputParam, enableDebugging, waitForComplete, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionTraceRunResult> RunActionTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(RunActionTraceAsync), () => inner.RunActionTraceAsync(actionId, inputParam, progress, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(RunXActionTraceAsync), () => inner.RunXActionTraceAsync(xActionJson, inputParam, progress, cancellationToken), cancellationToken);

    public Task<QuickerRpcFloatActionResult> FloatActionAsync(
        string actionId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(FloatActionAsync), () => inner.FloatActionAsync(actionId, cancellationToken), cancellationToken);

    public Task<QuickerRpcSubProgramVariableEditResult> EditGlobalSubProgramVariableAsync(
        string subProgramIdOrName,
        string variableKey,
        string defaultValue,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(EditGlobalSubProgramVariableAsync), () => inner.EditGlobalSubProgramVariableAsync(subProgramIdOrName, variableKey, defaultValue, cancellationToken), cancellationToken);

    public Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(
        string actionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetCompressedActionByIdAsync), () => inner.GetCompressedActionByIdAsync(actionId, returnMode, cancellationToken), cancellationToken);

    public Task<QuickerRpcGetActionProgramSourceResult> GetActionProgramSourceAsync(
        string actionId,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetActionProgramSourceAsync), () => inner.GetActionProgramSourceAsync(actionId, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(
        string actionId,
        string bodyJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplyActionProgramSourceAsync), () => inner.ApplyActionProgramSourceAsync(actionId, bodyJson, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceWithStorageAsync(
        string actionId,
        string bodyJson,
        QuickerRpcActionStorageIdentity storageIdentity,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplyActionProgramSourceWithStorageAsync), () => inner.ApplyActionProgramSourceWithStorageAsync(actionId, bodyJson, storageIdentity, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetCompressedSharedActionAsync), () => inner.GetCompressedSharedActionAsync(sharedActionId, returnMode, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchActionLibraryResult> SearchActionLibraryAsync(
        string keyword,
        int page = 1,
        int? days = null,
        int maxResults = 20,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchActionLibraryAsync), () => inner.SearchActionLibraryAsync(keyword, page, days, maxResults, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(
        string actionId,
        string xActionJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplyXActionToActionAsync), () => inner.ApplyXActionToActionAsync(actionId, xActionJson, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplyActionPatchResult> ApplyActionPatchToActionAsync(
        string actionId,
        string patchJson,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplyActionPatchToActionAsync), () => inner.ApplyActionPatchToActionAsync(actionId, patchJson, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcUpdateActionMetadataResult> UpdateActionMetadataAsync(
        string actionId,
        string? title = null,
        string? description = null,
        string? icon = null,
        string? contextMenuData = null,
        long? expectedEditVersion = null,
        bool force = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(UpdateActionMetadataAsync), () => inner.UpdateActionMetadataAsync(actionId, title, description, icon, contextMenuData, expectedEditVersion, force, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(
        string keyword,
        int? maxResults = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchStepRunnersAsync), () => inner.SearchStepRunnersAsync(keyword, maxResults, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchStepRunnersResult> ListStepRunnersAsync(
        int? maxResults = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListStepRunnersAsync), () => inner.ListStepRunnersAsync(maxResults, cancellationToken), cancellationToken);

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetStepRunnerDetailAsync), () => inner.GetStepRunnerDetailAsync(stepRunnerKey, controlFieldValue, cancellationToken), cancellationToken);

    public Task<QuickerRpcStepRunnerInputContractResult> GetStepRunnerInputContractAsync(
        QuickerRpcStepRunnerInputContractRequest request, CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetStepRunnerInputContractAsync), () => inner.GetStepRunnerInputContractAsync(request, cancellationToken), cancellationToken);

    public Task<QuickerRpcStepRunnerDetailResult> GetStepRunnerUiDetailAsync(
        string stepRunnerKey,
        string? controlFieldValue = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetStepRunnerUiDetailAsync), () => inner.GetStepRunnerUiDetailAsync(stepRunnerKey, controlFieldValue, cancellationToken), cancellationToken);

    public Task<QuickerRpcActionStepSummariesResult> GetActionStepSummariesAsync(
        IList<QuickerRpcActionStepSummaryInput> steps,
        string? embeddedSubProgramsJson = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetActionStepSummariesAsync), () => inner.GetActionStepSummariesAsync(steps, embeddedSubProgramsJson, cancellationToken), cancellationToken);

    public Task<QuickerRpcDesignerSearchPageResult> SearchStepQuickInsertAsync(
        string? keyword,
        int skip,
        IList<QuickerRpcQuickInsertSubProgramInput>? subPrograms,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchStepQuickInsertAsync), () => inner.SearchStepQuickInsertAsync(keyword, skip, subPrograms, cancellationToken), cancellationToken);

    public Task<QuickerRpcDesignerSearchPageResult> SearchToolboxModulesAsync(
        string? keyword,
        int skip,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchToolboxModulesAsync), () => inner.SearchToolboxModulesAsync(keyword, skip, cancellationToken), cancellationToken);

    public Task<QuickerRpcClipboardSpecialFormatReadResult> ReadClipboardSpecialFormatAsync(
        string format,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ReadClipboardSpecialFormatAsync), () => inner.ReadClipboardSpecialFormatAsync(format, cancellationToken), cancellationToken);

    public Task<QuickerRpcClipboardSpecialFormatWriteResult> WriteClipboardSpecialFormatAsync(
        string format,
        string text,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(WriteClipboardSpecialFormatAsync), () => inner.WriteClipboardSpecialFormatAsync(format, text, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(
        string? query,
        int maxResults = 40,
        bool expand = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchFontAwesomeIconsAsync), () => inner.SearchFontAwesomeIconsAsync(query, maxResults, expand, cancellationToken), cancellationToken);

    public Task<QuickerRpcFontAwesomePageResult> SearchFontAwesomeIconsPageAsync(
        string? query, string? style, int skip = 0, int take = 96,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchFontAwesomeIconsPageAsync), () => inner.SearchFontAwesomeIconsPageAsync(query, style, skip, take, cancellationToken), cancellationToken);

    public Task<QuickerRpcResourceCatalogPageResult> GetActionResourceCatalogPageAsync(
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetActionResourceCatalogPageAsync), () => inner.GetActionResourceCatalogPageAsync(request, cancellationToken), cancellationToken);

    public Task<QuickerRpcResourceCatalogPageResult> GetGlobalSubProgramResourceCatalogPageAsync(
        QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetGlobalSubProgramResourceCatalogPageAsync), () => inner.GetGlobalSubProgramResourceCatalogPageAsync(request, cancellationToken), cancellationToken);

    public Task<QuickerRpcResolveFontAwesomeIconsResult> ResolveFontAwesomeIconsAsync(
        IList<string> specs,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ResolveFontAwesomeIconsAsync), () => inner.ResolveFontAwesomeIconsAsync(specs, cancellationToken), cancellationToken);

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionSyntaxAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(CheckExpressionSyntaxAsync), () => inner.CheckExpressionSyntaxAsync(code, variableTypes, cancellationToken), cancellationToken);

    public Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ExecuteExpressionAsync), () => inner.ExecuteExpressionAsync(code, variablesJson, onUiThread, cancellationToken), cancellationToken);

    public Task<QuickerRpcChromeControlResult> ExecuteChromeControlAsync(
        string operation,
        string? parametersJson = null,
        string? sessionId = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ExecuteChromeControlAsync), () => inner.ExecuteChromeControlAsync(operation, parametersJson, sessionId, cancellationToken), cancellationToken);

    public Task<QuickerRpcChromeControlTabsResult> ListBrowserTabsAsync(
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListBrowserTabsAsync), () => inner.ListBrowserTabsAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptSyntaxAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(CheckCSharpScriptSyntaxAsync), () => inner.CheckCSharpScriptSyntaxAsync(code, references, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchSettingsResult> SearchSettingsAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SearchSettingsAsync), () => inner.SearchSettingsAsync(query, maxResults, cancellationToken), cancellationToken);

    public Task<QuickerRpcListSettingsResult> ListSettingsAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListSettingsAsync), () => inner.ListSettingsAsync(scope, maxResults, cancellationToken), cancellationToken);

    public Task<QuickerRpcGetSettingResult> GetSettingAsync(
        string key,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetSettingAsync), () => inner.GetSettingAsync(key, cancellationToken), cancellationToken);

    public Task<QuickerRpcSetSettingResult> SetSettingAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SetSettingAsync), () => inner.SetSettingAsync(key, value, cancellationToken), cancellationToken);

    public Task<QuickerRpcApplySettingsResult> ApplySettingsAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ApplySettingsAsync), () => inner.ApplySettingsAsync(changes, cancellationToken), cancellationToken);

    public Task<QuickerRpcListSettingsPagesResult> ListSettingsPagesAsync(
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListSettingsPagesAsync), () => inner.ListSettingsPagesAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcListSettingsDirectLinksResult> ListSettingsDirectLinksAsync(
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListSettingsDirectLinksAsync), () => inner.ListSettingsDirectLinksAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcOpenSettingsUiResult> OpenSettingsUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(OpenSettingsUiAsync), () => inner.OpenSettingsUiAsync(target, exeFile, searchText, query, settingKey, preset, cancellationToken), cancellationToken);

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveSettingsIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ResolveSettingsIntentAsync), () => inner.ResolveSettingsIntentAsync(query, settingKey, preset, cancellationToken), cancellationToken);

    public Task<QuickerRpcResolveLauncherIntentResult> ResolveLauncherIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ResolveLauncherIntentAsync), () => inner.ResolveLauncherIntentAsync(query, maxResults, scopes, cancellationToken), cancellationToken);

    public Task<QuickerRpcTriggerListResult> ListTriggersAsync(
        string? query = null,
        string? eventType = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListTriggersAsync), () => inner.ListTriggersAsync(query, eventType, cancellationToken), cancellationToken);

    public Task<QuickerRpcTriggerEventTypesResult> ListTriggerEventTypesAsync(
        string? eventType = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(ListTriggerEventTypesAsync), () => inner.ListTriggerEventTypesAsync(eventType, cancellationToken), cancellationToken);

    public Task<QuickerRpcTriggerSaveResult> SaveTriggerAsync(
        QuickerRpcTriggerTaskInfo task,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SaveTriggerAsync), () => inner.SaveTriggerAsync(task, cancellationToken), cancellationToken);

    public Task<QuickerRpcTriggerDeleteResult> DeleteTriggerAsync(
        string id,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(DeleteTriggerAsync), () => inner.DeleteTriggerAsync(id, cancellationToken), cancellationToken);

    public Task<QuickerRpcTriggerSaveResult> SetTriggerEnabledAsync(
        string id,
        bool enabled,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(SetTriggerEnabledAsync), () => inner.SetTriggerEnabledAsync(id, enabled, cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchIndexStatusResult> GetSearchIndexStatusAsync(
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetSearchIndexStatusAsync), () => inner.GetSearchIndexStatusAsync(cancellationToken), cancellationToken);

    public Task<QuickerRpcSearchIndexRebuildResult> RebuildSearchIndexAsync(
        string? region = null,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(RebuildSearchIndexAsync), () => inner.RebuildSearchIndexAsync(region, cancellationToken), cancellationToken);

    public Task<QuickerRpcDesignerContextResult> GetActionDesignerContextAsync(
        bool includeXAction = false,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(GetActionDesignerContextAsync), () => inner.GetActionDesignerContextAsync(includeXAction, cancellationToken), cancellationToken);

    public Task<QuickerRpcTextToolRunResult> RunTextToolAsync(
        string toolId,
        string? currentValue = null,
        int timeoutSeconds = 300,
        CancellationToken cancellationToken = default) =>
        InvokeAsync(nameof(RunTextToolAsync), () => inner.RunTextToolAsync(toolId, currentValue, timeoutSeconds, cancellationToken), cancellationToken);
}
