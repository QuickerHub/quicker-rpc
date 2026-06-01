using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Scan <b>Debug</b> <c>Quicker.exe</c> (unobfuscated). Run:
/// <c>dotnet test QuickerRpc.Plugin.Test --filter FullyQualifiedName~QuickerExeDebugScanTests</c>
/// </summary>
[TestClass]
public sealed class QuickerExeDebugScanTests
{
    public TestContext TestContext { get; set; } = null!;

    private void WriteLine(string message) => TestContext.WriteLine(message);

    [TestMethod]
    public void Scan_AppState_static_properties_by_name()
    {
        if (!TryLoadDebug(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanAppStateStaticProperties(assembly, WriteLine);
    }

    [TestMethod]
    public void Scan_SaveEditingAction_on_ActionEditMgr_by_name()
    {
        if (!TryLoadDebug(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanTypeAndMethodByName(
            assembly,
            "Quicker.Domain.Services.ActionEditMgr",
            "SaveEditingAction",
            QuickerExeReflectionProbe.InstanceMethodFlags,
            WriteLine);
        QuickerExeReflectionProbe.ScanSaveEditingActionMethods(assembly, WriteLine);
    }

    [TestMethod]
    public void Scan_FloatAction_on_ActionEditMgr_by_name()
    {
        if (!TryLoadDebug(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanTypeAndMethodByName(
            assembly,
            "Quicker.Domain.Services.ActionEditMgr",
            "FloatAction",
            QuickerExeReflectionProbe.InstanceMethodFlags,
            WriteLine);
    }

    [TestMethod]
    public void Scan_AppState_GetService_generic_by_name()
    {
        if (!TryLoadDebug(out var assembly))
        {
            return;
        }

        QuickerExeReflectionProbe.ScanTypeAndMethodByName(
            assembly,
            "Quicker.Domain.AppState",
            "GetService",
            QuickerExeReflectionProbe.StaticMethodFlags,
            WriteLine);
    }

    private bool TryLoadDebug(out Assembly assembly)
    {
        var path = QuickerExeProbePaths.ResolveDebugQuickerExe();
        if (!QuickerExeReflectionProbe.TryLoadQuickerExe(path, WriteLine, out assembly))
        {
            Assert.Inconclusive(
                "Debug Quicker.exe not found. Build Quicker or set QUICKER_DEBUG_DLL_PATH. Path: " + path);
            return false;
        }

        return true;
    }
}
