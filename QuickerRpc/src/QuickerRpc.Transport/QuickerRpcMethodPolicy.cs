using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport;

/// <summary>Unknown/new methods are mutating until explicitly classified.</summary>
public static class QuickerRpcMethodPolicy
{
    public static bool IsReadOnly(string method) => method switch
    {
        nameof(IQuickerRpcService.PingAsync)
        or nameof(IQuickerRpcService.GetProtocolVersionAsync)
        or nameof(IQuickerRpcService.GetHostSessionAsync)
        or nameof(IQuickerRpcService.GetQuickerAccountAsync)
        or nameof(IQuickerRpcService.GetQuickerWebSessionAsync)
        or nameof(IQuickerRpcService.PreflightPublishSharedActionAsync)
        or nameof(IQuickerRpcService.GetSharedActionDetailHtmlAsync)
        or nameof(IQuickerRpcService.SearchActionSummariesAsync)
        or nameof(IQuickerRpcService.SearchActionsAsync)
        or nameof(IQuickerRpcService.SearchGlobalSubProgramsAsync)
        or nameof(IQuickerRpcService.ListGlobalSubProgramsAsync)
        or nameof(IQuickerRpcService.GetCompressedSubProgramAsync)
        or nameof(IQuickerRpcService.PreflightPublishSharedSubProgramAsync)
        or nameof(IQuickerRpcService.GetCompressedActionByIdAsync)
        or nameof(IQuickerRpcService.GetActionProgramSourceAsync)
        or nameof(IQuickerRpcService.GetCompressedSharedActionAsync)
        or nameof(IQuickerRpcService.SearchActionLibraryAsync)
        or nameof(IQuickerRpcService.SearchStepRunnersAsync)
        or nameof(IQuickerRpcService.ListStepRunnersAsync)
        or nameof(IQuickerRpcService.GetStepRunnerDetailAsync)
        or nameof(IQuickerRpcService.GetStepRunnerUiDetailAsync)
        or nameof(IQuickerRpcService.GetActionStepSummariesAsync)
        or nameof(IQuickerRpcService.SearchStepQuickInsertAsync)
        or nameof(IQuickerRpcService.SearchToolboxModulesAsync)
        or nameof(IQuickerRpcService.ReadClipboardSpecialFormatAsync)
        or nameof(IQuickerRpcService.SearchFontAwesomeIconsAsync)
        or nameof(IQuickerRpcService.ResolveFontAwesomeIconsAsync)
        or nameof(IQuickerRpcService.CheckExpressionSyntaxAsync)
        or nameof(IQuickerRpcService.ListBrowserTabsAsync)
        or nameof(IQuickerRpcService.CheckCSharpScriptSyntaxAsync)
        or nameof(IQuickerRpcService.SearchSettingsAsync)
        or nameof(IQuickerRpcService.ListSettingsAsync)
        or nameof(IQuickerRpcService.GetSettingAsync)
        or nameof(IQuickerRpcService.ListSettingsPagesAsync)
        or nameof(IQuickerRpcService.ListSettingsDirectLinksAsync)
        or nameof(IQuickerRpcService.ResolveSettingsIntentAsync)
        or nameof(IQuickerRpcService.ResolveLauncherIntentAsync)
        or nameof(IQuickerRpcService.ListTriggersAsync)
        or nameof(IQuickerRpcService.ListTriggerEventTypesAsync)
        or nameof(IQuickerRpcService.GetSearchIndexStatusAsync)
        or nameof(IQuickerRpcService.GetActionDesignerContextAsync) => true,
        _ => false,
    };

    public static string? Capability(string method) => method switch
    {
        "GetActionProgramSourceAsync" => QuickerRpcHostCapabilityNames.ActionSourceRead,
        "ApplyActionProgramSourceAsync" => QuickerRpcHostCapabilityNames.ActionSourceWrite,
        "ApplyActionProgramSourceWithStorageAsync" => QuickerRpcHostCapabilityNames.ActionSourceWrite,
        "GetCompressedActionByIdAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyRead,
        "ApplyXActionToActionAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite,
        "ApplyActionPatchToActionAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyPatch,
        "UpdateActionMetadataAsync" => QuickerRpcHostCapabilityNames.ActionPresentationWrite,
        "GetActionDesignerContextAsync" => QuickerRpcHostCapabilityNames.DesignerContextRead,
        _ => null,
    };
}
