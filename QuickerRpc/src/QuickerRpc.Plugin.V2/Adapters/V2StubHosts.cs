using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>Placeholder host ports until V2 reflection adapters are implemented.</summary>
internal static class V2StubMessage
{
    public const string NotImplemented =
        "QuickerRpc V2 reflection host does not implement this port yet.";

    public const string TraceNotImplemented =
        "QuickerRpc V2 trace run is not wired yet; use action run (no --trace) or V1 Quicker for trace.";
}

internal sealed class V2ActionSharingHost : IQuickerRpcActionSharingHost
{
    public Task<QuickerRpcActionUpdateResult> UpdateSharedActionAsync(
        string actionId,
        string? changeLog = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionUpdateResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionPublishResult> PublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionPublishResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionPublishPreflightResult> PreflightPublishSharedActionAsync(
        string actionId,
        QuickerRpcActionPublishRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionPublishPreflightResult { Ready = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcGetCompressedSharedActionResult> GetCompressedSharedActionAsync(
        string sharedActionId,
        string? returnMode = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcGetCompressedSharedActionResult
        {
            Success = false,
            ErrorMessage = V2StubMessage.NotImplemented,
        });
}

internal sealed class V2ActionCatalogHost : IQuickerRpcActionCatalogHost
{
    public Task<QuickerRpcCreateActionResult> CreateActionAsync(
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateActionResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionUpdateResult> DeleteActionAsync(
        string actionId,
        bool showConfirm = false,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionUpdateResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcMoveActionResult> MoveActionAsync(
        string actionId,
        string targetProfile,
        int? targetRow = null,
        int? targetCol = null,
        bool allowSwap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcMoveActionResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateGlobalProfilesResult> CreateGlobalProfilesAsync(
        int count = 1,
        bool insertAfterFirstPage = false,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateGlobalProfilesResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateGlobalProfilesResult> ReorderGlobalProfilesAfterFirstAsync(
        IReadOnlyList<string> profileIds,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateGlobalProfilesResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcDeleteProfileResult> DeleteEmptyProfilesAsync(
        IReadOnlyList<string> profileIdsOrNames,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcDeleteProfileResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcDeleteProfileResult> PruneEmptyProfilesAsync(
        string scope,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcDeleteProfileResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcCreateVirtualProcessResult> EnsureVirtualProcessAsync(
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName = null,
        bool dedicatedSubProgramOnly = true,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcCreateVirtualProcessResult { Ok = false, Message = V2StubMessage.NotImplemented });
}

internal sealed class V2SettingsHost : IQuickerRpcSettingsHost
{
    public Task<QuickerRpcSearchSettingsResult> SearchAsync(
        string? query,
        int maxResults = 30,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcSearchSettingsResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcListSettingsResult> ListAsync(
        string? scope = null,
        int maxResults = 100,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcListSettingsResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcGetSettingResult> GetAsync(
        string key,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcGetSettingResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcSetSettingResult> SetAsync(
        string key,
        string value,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcSetSettingResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcApplySettingsResult> ApplyAsync(
        IList<QuickerRpcSettingChangeItem> changes,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcApplySettingsResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcListSettingsPagesResult> ListPagesAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcListSettingsPagesResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcListSettingsDirectLinksResult> ListDirectLinksAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcListSettingsDirectLinksResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcOpenSettingsUiResult> OpenUiAsync(
        string? target,
        string? exeFile = null,
        string? searchText = null,
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcOpenSettingsUiResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcResolveSettingsIntentResult> ResolveIntentAsync(
        string? query = null,
        string? settingKey = null,
        string? preset = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcResolveSettingsIntentResult { Ok = false, Message = V2StubMessage.NotImplemented });
}

internal sealed class V2ActionDocHost : IQuickerRpcActionDocHost
{
    public Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionDocResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionDocResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<QuickerRpcActionDocResult> SubmitForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcActionDocResult { Ok = false, Message = V2StubMessage.NotImplemented });

    public Task<string> ProbeDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(V2StubMessage.NotImplemented);

    public Task<QuickerRpcSharedInfoWebSessionResult> PrepareWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        Task.FromResult(new QuickerRpcSharedInfoWebSessionResult { Ok = false, Message = V2StubMessage.NotImplemented });
}

internal sealed class V2ExpressionHost : IQuickerRpcExpressionHost
{
    private readonly CodeSyntaxCheckService _syntax = new();
    private readonly ExpressionExecuteService _execute = new();

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckExpressionAsync(
        string code,
        IDictionary<string, string>? variableTypes = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_syntax.CheckExpression(code, variableTypes));
    }

    public Task<QuickerRpcExpressionExecuteResult> ExecuteExpressionAsync(
        string code,
        string? variablesJson = null,
        bool onUiThread = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_execute.Execute(code, variablesJson, onUiThread));
    }

    public Task<QuickerRpcCodeSyntaxCheckResult> CheckCSharpScriptAsync(
        string code,
        string? references = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_syntax.CheckCSharpScript(code, references));
    }
}
