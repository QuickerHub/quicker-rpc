using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Test;

internal static class QuickerExeAssemblyResolve
{
    public static IDisposable Register(string quickerInstallDirectory)
    {
        var directory = quickerInstallDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        ResolveEventHandler handler = (sender, args) =>
        {
            var simpleName = new AssemblyName(args.Name).Name;
            if (string.IsNullOrWhiteSpace(simpleName))
            {
                return null;
            }

            var candidate = Path.Combine(directory, simpleName + ".dll");
            return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
        };

        AppDomain.CurrentDomain.AssemblyResolve += handler;
        return new Registration(handler);
    }

    private sealed class Registration : IDisposable
    {
        private readonly ResolveEventHandler _handler;

        public Registration(ResolveEventHandler handler) => _handler = handler;

        public void Dispose() => AppDomain.CurrentDomain.AssemblyResolve -= _handler;
    }
}

[TestClass]
public sealed class SharedActionHostReflectionTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void Probe_WebConnector_methods_on_release_Quicker_exe()
    {
        if (!TryLoadReleaseAssemblies(out var quickerExe, out var quickerCommon, out var quickerDir))
        {
            return;
        }

        using var resolveScope = QuickerExeAssemblyResolve.Register(quickerDir);

        var vmType = quickerCommon.GetType("Quicker.Common.Vm.SharedActionVm");
        var dtoType = quickerCommon.GetType("Quicker.Common.Vm.SharedActionDto");
        Assert.IsNotNull(vmType, "Quicker.Common.SharedActionVm missing.");
        Assert.IsNotNull(dtoType, "Quicker.Common.SharedActionDto missing.");

        var sw = Stopwatch.StartNew();
        var ok = SharedActionHostReflection.TryProbeWebConnectorMethods(
            quickerExe,
            out var shareAction,
            out var shareSubProgram);
        sw.Stop();

        Assert.IsTrue(ok, "WebConnector share methods not resolved on Release Quicker.exe.");
        Assert.IsNotNull(shareAction);
        Assert.IsNotNull(shareSubProgram, "ShareSubProgramAsync should exist on WebConnector.");
        TestContext.WriteLine($"Probe elapsed: {sw.ElapsedMilliseconds} ms");
        TestContext.WriteLine("ShareAction: " + shareAction!.DeclaringType!.FullName + "." + shareAction.Name);
        TestContext.WriteLine("ShareSubProgram: " + shareSubProgram!.DeclaringType!.FullName + "." + shareSubProgram.Name);
        Assert.IsTrue(sw.ElapsedMilliseconds < 15_000, "WebConnector probe took too long.");
    }

    [TestMethod]
    public void Scan_ShareActionAsync_signature_uses_Quicker_Common_vm_types()
    {
        if (!TryLoadReleaseAssemblies(out var quickerExe, out var quickerCommon, out var quickerDir))
        {
            return;
        }

        using var resolveScope = QuickerExeAssemblyResolve.Register(quickerDir);

        var vmType = quickerCommon.GetType("Quicker.Common.Vm.SharedActionVm");
        var dtoType = quickerCommon.GetType("Quicker.Common.Vm.SharedActionDto");
        Assert.IsNotNull(vmType);
        Assert.IsNotNull(dtoType);

        var apiResultType = quickerCommon.GetType("Quicker.Common.Vm.ApiResult`1")?.MakeGenericType(dtoType!);
        Assert.IsNotNull(apiResultType);

        var taskType = typeof(System.Threading.Tasks.Task<>).MakeGenericType(apiResultType!);
        Assert.IsTrue(
            SharedActionHostReflection.TryProbeWebConnectorMethods(quickerExe, out var shareAction, out _),
            "ShareActionAsync(SharedActionVm) not resolved by signature.");
        Assert.AreEqual(vmType, shareAction!.GetParameters()[0].ParameterType);
        Assert.AreEqual(taskType, shareAction.ReturnType);
        QuickerAssemblyReflection.WriteMethodDetail(shareAction, TestContext.WriteLine);
    }

    private bool TryLoadReleaseAssemblies(
        out Assembly quickerExe,
        out Assembly quickerCommon,
        out string quickerDir)
    {
        quickerExe = null!;
        quickerCommon = null!;
        quickerDir = string.Empty;

        var exePath = QuickerExeProbePaths.ResolveReleaseQuickerExe();
        if (!QuickerExeReflectionProbe.TryLoadQuickerExe(exePath, TestContext.WriteLine, out quickerExe))
        {
            Assert.Inconclusive("Release Quicker.exe not found. Path: " + exePath);
            return false;
        }

        quickerDir = Path.GetDirectoryName(exePath)!;
        var commonPath = Path.Combine(quickerDir, "Quicker.Common.dll");
        if (!File.Exists(commonPath))
        {
            Assert.Inconclusive("Quicker.Common.dll not found beside Quicker.exe: " + commonPath);
            return false;
        }

        quickerCommon = Assembly.LoadFrom(commonPath);
        return true;
    }
}
