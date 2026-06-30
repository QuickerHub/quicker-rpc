using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class QuickerV2HostProbeTests
{
    private static readonly string HostRoot = ResolveHostRoot();

    [TestMethod]
    public void V2_Quicker_dll_exposes_Launcher_and_action_services()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        Assert.IsTrue(File.Exists(quickerDll), $"Missing {quickerDll}");

        var types = ReadTypeNames(quickerDll);
        AssertContains(types, "Quicker.Domain.Services.Launcher");
        AssertContains(types, "Quicker.Domain.Services.Actions.ActionRuntimeLookupService");
        AssertContains(types, "Quicker.Domain.Services.ActionItem2Store");
        AssertContains(types, "Quicker.Domain.Services.ActionEditingStateService");
        AssertContains(types, "Quicker.Utilities.Extensions.ActionItem2Extensions");
        AssertContains(types, "Quicker.ReactiveData.GlobalSubProgramDataService");
    }

    [TestMethod]
    public void V2_Common_dll_exposes_ActionItem2_model()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var commonDll = Path.Combine(HostRoot, "Quicker.Common.dll");
        Assert.IsTrue(File.Exists(commonDll), $"Missing {commonDll}");

        var types = ReadTypeNames(commonDll);
        AssertContains(types, "Quicker.Common.V2.ActionItem2");
    }

    [TestMethod]
    public void V2_ActionItem2_lives_in_Common_not_main_Quicker_dll()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var mainTypes = ReadTypeNames(Path.Combine(HostRoot, "Quicker.dll"));
        var commonTypes = ReadTypeNames(Path.Combine(HostRoot, "Quicker.Common.dll"));

        Assert.IsFalse(mainTypes.Contains("Quicker.Common.V2.ActionItem2"));
        Assert.IsTrue(commonTypes.Contains("Quicker.Common.V2.ActionItem2"));
    }

    [TestMethod]
    public void V2_StepEngine_dll_exposes_subprogram_and_step_runner_contracts()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var stepEngineDll = Path.Combine(HostRoot, "Quicker.StepEngine.dll");
        Assert.IsTrue(File.Exists(stepEngineDll), $"Missing {stepEngineDll}");

        var types = ReadTypeNames(stepEngineDll);
        AssertContains(types, "Quicker.Domain.Actions.X.SubProgram");
        AssertContains(types, "Quicker.Domain.Actions.X.StepRunners.IStepRunnerService");
        AssertContains(types, "Quicker.Domain.Actions.X.Storage.ActionStep");
    }

    private static void AssertContains(HashSet<string> types, string fullName) =>
        Assert.IsTrue(types.Contains(fullName), $"Expected type not found: {fullName}");

    private static HashSet<string> ReadTypeNames(string dllPath)
    {
        using var fs = File.OpenRead(dllPath);
        using var pe = new PEReader(fs);
        var reader = pe.GetMetadataReader();
        var set = new HashSet<string>(StringComparer.Ordinal);
        foreach (var handle in reader.TypeDefinitions)
        {
            var type = reader.GetTypeDefinition(handle);
            var ns = reader.GetString(type.Namespace);
            var name = reader.GetString(type.Name);
            if (name.StartsWith("<", StringComparison.Ordinal))
            {
                continue;
            }

            set.Add($"{ns}.{name}");
        }

        return set;
    }

    private static string ResolveHostRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "tools", "quicker-host", "net10");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            candidate = Path.Combine(dir.FullName, "..", "..", "..", "..", "..", "..", "tools", "quicker-host", "net10");
            candidate = Path.GetFullPath(candidate);
            if (Directory.Exists(candidate))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        var env = Environment.GetEnvironmentVariable("QUICKER_V2_DLL_PATH");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return Path.GetDirectoryName(env) ?? env;
        }

        return Path.Combine("tools", "quicker-host", "net10");
    }
}
