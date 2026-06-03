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

        var vmType = assembly.GetType("Quicker.Common.Vm.SharedActionVm");
        var dtoType = assembly.GetType("Quicker.Common.Vm.SharedActionDto");
        var apiResultType = assembly.GetType("Quicker.Common.Vm.ApiResult`1")?.MakeGenericType(dtoType!);
        var taskType = typeof(System.Threading.Tasks.Task<>).MakeGenericType(apiResultType!);

        var method = assembly
            .GetTypes()
            .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static))
            .FirstOrDefault(m =>
                m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType == vmType
                && m.ReturnType == taskType);

        if (method is null)
        {
            Assert.Fail("Release Quicker.exe: ShareActionAsync(SharedActionVm) not resolved by signature.");
        }

        QuickerAssemblyReflection.WriteMethodDetail(method, WriteLine);
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
