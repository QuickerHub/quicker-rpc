using System;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class MethodPolicyTests
{
    [TestMethod]
    public void Current_reviewed_read_contract_is_preserved()
    {
        var expected = new[]
        {
            "PingAsync", "GetProtocolVersionAsync", "GetHostSessionAsync", "GetQuickerAccountAsync", "GetQuickerWebSessionAsync",
            "PreflightPublishSharedActionAsync", "GetSharedActionDetailHtmlAsync", "SearchActionSummariesAsync", "SearchActionsAsync",
            "SearchGlobalSubProgramsAsync", "ListGlobalSubProgramsAsync", "GetCompressedSubProgramAsync", "PreflightPublishSharedSubProgramAsync",
            "GetCompressedActionByIdAsync", "GetActionProgramSourceAsync", "GetCompressedSharedActionAsync", "SearchActionLibraryAsync",
            "SearchStepRunnersAsync", "ListStepRunnersAsync", "GetStepRunnerDetailAsync", "GetStepRunnerUiDetailAsync", "GetActionStepSummariesAsync",
            "SearchStepQuickInsertAsync", "SearchToolboxModulesAsync", "ReadClipboardSpecialFormatAsync", "SearchFontAwesomeIconsAsync",
            "SearchFontAwesomeIconsPageAsync", "ResolveFontAwesomeIconsAsync", "CheckExpressionSyntaxAsync", "ListBrowserTabsAsync", "CheckCSharpScriptSyntaxAsync",
            "SearchSettingsAsync", "ListSettingsAsync", "GetSettingAsync", "ListSettingsPagesAsync", "ListSettingsDirectLinksAsync",
            "ResolveSettingsIntentAsync", "ResolveLauncherIntentAsync", "ListTriggersAsync", "ListTriggerEventTypesAsync",
            "GetSearchIndexStatusAsync", "GetActionDesignerContextAsync",
        };
        var actual = typeof(IQuickerRpcService).GetMethods().Select(method => method.Name).Where(QuickerRpcMethodPolicy.IsReadOnly).ToArray();
        CollectionAssert.AreEquivalent(expected, actual);
    }

    [DataTestMethod]
    [DataRow("GetOrCreateActionAsync")]
    [DataRow("UnknownGetAsync")]
    [DataRow("GetUnknownAsync")]
    [DataRow("SearchAndSaveAsync")]
    [DataRow("ListAndRemoveAsync")]
    [DataRow("CheckAndRepairAsync")]
    [DataRow("PreflightAndWriteAsync")]
    [DataRow("ApplyActionProgramSourceWithStorageAsync")]
    public void Unknown_names_and_storage_apply_are_mutating(string method) => Assert.IsFalse(QuickerRpcMethodPolicy.IsReadOnly(method));

    [TestMethod]
    public void Storage_apply_requires_the_source_write_capability() => Assert.AreEqual(
        QuickerRpcHostCapabilityNames.ActionSourceWrite,
        QuickerRpcMethodPolicy.Capability(nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync)));

    [TestMethod]
    public void Icon_page_requires_its_independent_read_capability() => Assert.AreEqual(
        QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead,
        QuickerRpcMethodPolicy.Capability(nameof(IQuickerRpcService.SearchFontAwesomeIconsPageAsync)));
}
