using System;
using System.Linq;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Scan <b>Release</b> <c>Quicker.exe</c> (installed). Run:
/// <c>dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeReleaseScanTests</c>
/// </summary>
[TestClass]
public sealed class QuickerExeReleaseScanTests
{
    public TestContext TestContext { get; set; } = null!;

    private void WriteLine(string message) => TestContext.WriteLine(message);

    [TestMethod]
    public void Scan_AppState_static_properties_by_name()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanAppStateStaticProperties(assembly, WriteLine);
    }

    [TestMethod]
    public void Scan_SaveEditingAction_signature_on_ActionEditMgr()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        WriteLine(
            "Note: on obfuscated Release builds, prefer signature scan over type/method name lookup.");
        QuickerExeReflectionProbe.ScanSaveEditingActionMethods(assembly, WriteLine);

        var actionItem = QuickerActionEditReflection.TryFindSaveEditingActionOnActionEditMgrType(assembly);
        if (actionItem is null)
        {
            Assert.Fail("Release Quicker.exe: SaveEditingAction(ActionItem) not resolved by signature.");
        }

        QuickerAssemblyReflection.WriteMethodDetail(actionItem, WriteLine);
    }

    [TestMethod]
    public void Scan_TriggerCommandService_SaveGlobalSubProgram_signature()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        WriteLine("Note: Release uses signature scan (not obfuscated type names).");
        QuickerExeReflectionProbe.ScanTriggerCommandSaveGlobalSubProgram(assembly, WriteLine);
        var save = QuickerTriggerCommandReflection.TryFindSaveGlobalSubProgram(assembly);
        if (save is null
            || string.Equals(save.DeclaringType?.FullName, "Quicker.Domain.Services.DataService", StringComparison.Ordinal))
        {
            Assert.Inconclusive(
                "Release Quicker.exe: TriggerCommandService.SaveGlobalSubProgram not found (legacy DataService-only build).");
        }
    }

    [TestMethod]
    public void Scan_ActionEditMgr_type_by_name_may_fail_when_obfuscated()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanTypeAndMethodByName(
            assembly,
            "Quicker.Domain.Services.ActionEditMgr",
            "SaveEditingAction",
            QuickerExeReflectionProbe.InstanceMethodFlags,
            WriteLine);
    }

    [TestMethod]
    public void Scan_ShareActionAsync_signature_on_WebConnector()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        var commonPath = System.IO.Path.Combine(
            System.IO.Path.GetDirectoryName(QuickerExeProbePaths.ResolveReleaseQuickerExe())!,
            "Quicker.Common.dll");
        if (!System.IO.File.Exists(commonPath))
        {
            Assert.Inconclusive("Quicker.Common.dll not found beside Quicker.exe.");
        }

        var common = Assembly.LoadFrom(commonPath);
        var vmType = common.GetType("Quicker.Common.Vm.SharedActionVm");
        var dtoType = common.GetType("Quicker.Common.Vm.SharedActionDto");
        if (vmType is null || dtoType is null)
        {
            Assert.Inconclusive("Release Quicker.Common: SharedActionVm/SharedActionDto types not found.");
        }

        Assert.IsTrue(
            QuickerRpc.Plugin.Reflection.SharedActionHostReflection.TryProbeWebConnectorMethods(
                assembly,
                out var method,
                out _),
            "Release Quicker.exe: ShareActionAsync(SharedActionVm) not resolved by signature.");

        QuickerAssemblyReflection.WriteMethodDetail(method!, WriteLine);
    }

    [TestMethod]
    public void Scan_DataService_SaveGlobalSubProgram_wrapper()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanDataServiceSaveGlobalSubProgram(assembly, WriteLine);
        var dataService = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, "Quicker.Domain.Services.DataService");
        Assert.IsNotNull(dataService);
        var save = QuickerDataServiceSubProgramReflection.TryFindSaveGlobalSubProgramOnDataService(dataService!);
        Assert.IsNotNull(save, "Release Quicker.exe: DataService save wrapper not resolved.");
        Assert.IsTrue(
            QuickerDataServiceSubProgramReflection.MethodBodyInvokesTriggerSync(save!),
            "DataService save wrapper should invoke TriggerSync.");
    }

    [TestMethod]
    public void Scan_ActionDesigner_paste_refresh_stable_surface()
    {
        if (!TryLoadRelease(out var assembly))
        {
            return;
        }

        WriteLine("UpdateXActionUi: CeaQuicker anchor CheckIfCanSave+6, then void()-token fallback.");
        if (!QuickerActionDesignerReflection.TryVerifyPasteRefreshSurface(assembly, out var missing))
        {
            Assert.Fail("Release Quicker.exe: paste refresh surface missing: " + missing);
        }

        var designerType = QuickerActionDesignerReflection.TryGetDesignerWindowType(assembly);
        Assert.IsNotNull(designerType);

        var byAnchor = QuickerActionDesignerReflection.TryFindMethodByNameListAnchorOffset(
            designerType!,
            QuickerActionDesignerReflection.UpdateUiAnchorMethodName,
            QuickerActionDesignerReflection.UpdateXActionUiAnchorOffset);
        Assert.IsNotNull(byAnchor, "CheckIfCanSave+6 did not resolve UpdateXActionUi on Release.");

        var updateUi = QuickerActionDesignerReflection.TryFindUpdateXActionUiMethod(designerType!);
        Assert.IsNotNull(updateUi, "UpdateXActionUi not resolved on Release.");
        Assert.AreEqual(byAnchor!.MetadataToken, updateUi!.MetadataToken);
        QuickerAssemblyReflection.WriteMethodDetail(updateUi, WriteLine);

        var voidMethods = QuickerActionDesignerReflection.GetDeclaredVoidNoArgInstanceMethods(designerType!);
        Assert.AreEqual(
            QuickerActionDesignerReflection.ClearNotUsedInternalSubProgramsAnchorName,
            voidMethods[QuickerActionDesignerReflection.ClearNotUsedInternalSubProgramsAnchorIndex].Name);

        var saveState = QuickerActionDesignerReflection.TryFindDoSaveActionStateMethod(designerType!);
        if (saveState is not null)
        {
            WriteLine("DoSaveActionState candidate:");
            QuickerAssemblyReflection.WriteMethodDetail(saveState, WriteLine);
        }

        var saveAllData = QuickerActionDesignerReflection.TryFindSaveAllDataMethod(designerType!);
        Assert.IsNotNull(saveAllData, "Release Quicker.exe: SaveAllData not resolved.");
        QuickerAssemblyReflection.WriteMethodDetail(saveAllData!, WriteLine);

        var saveWithoutClose = QuickerActionDesignerReflection.TryFindDoSaveWithoutCloseMethod(designerType!);
        Assert.IsNotNull(saveWithoutClose, "Release Quicker.exe: DoSaveWithoutClose (Ctrl+S) not resolved.");
        QuickerAssemblyReflection.WriteMethodDetail(saveWithoutClose!, WriteLine);

        var restore = QuickerActionDesignerReflection.TryFindRestoreStateMethod(designerType!, assembly);
        if (restore is not null)
        {
            WriteLine("RestoreState(ActionStepsDto) candidate:");
            QuickerAssemblyReflection.WriteMethodDetail(restore, WriteLine);
        }
        else
        {
            WriteLine("RestoreState(ActionStepsDto): not uniquely resolved (optional).");
        }

        var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly;
        Assert.IsNotNull(designerType!.GetField("ToolContent", flags), "Release: ToolContent field required for tab sync.");
        Assert.IsNotNull(designerType.GetProperty("TheToolbox", flags), "Release: TheToolbox property required for module tab sync.");
    }

    private bool TryLoadRelease(out Assembly assembly)
    {
        var path = QuickerExeProbePaths.ResolveReleaseQuickerExe();
        if (!QuickerExeReflectionProbe.TryLoadQuickerExe(path, WriteLine, out assembly))
        {
            Assert.Inconclusive(
                "Release Quicker.exe not found. Install Quicker or set QUICKER_DLL_PATH. Path: " + path);
            return false;
        }

        return true;
    }
}
