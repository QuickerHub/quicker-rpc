using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class QuickerV2SyncTypeProbeTests
{
    private static readonly string HostRoot = ResolveHostRoot();

    [TestMethod]
    public void V2_Quicker_dll_lists_sync_related_types()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var types = ReadTypeNames(quickerDll)
            .Where(t => t.Contains("Sync", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("Cloud", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("ReactiveData", StringComparison.OrdinalIgnoreCase))
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();

        TestContext.WriteLine($"sync/cloud/reactive types ({types.Count}):");
        foreach (var type in types)
        {
            TestContext.WriteLine(type);
        }

        Assert.IsTrue(types.Any(t => t.Contains("Sync", StringComparison.OrdinalIgnoreCase)),
            "Expected at least one Sync-related type in Quicker.dll metadata.");
    }

    [TestMethod]
    public void V2_GlobalSubProgramDataService_exposes_save_and_sync_methods()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var methods = ReadTypeMethods(
            quickerDll,
            "Quicker.ReactiveData.GlobalSubProgramDataService",
            "Quicker.ReactiveData.IGlobalSubProgramDataService");

        TestContext.WriteLine($"GlobalSubProgramDataService methods ({methods.Count}):");
        foreach (var method in methods.OrderBy(m => m, StringComparer.Ordinal))
        {
            TestContext.WriteLine(method);
        }

        Assert.IsTrue(methods.Any(m => m.StartsWith("AddOrUpdate", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void V2_ISyncService_exposes_sync_trigger_methods()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var methods = ReadTypeMethods(
            quickerDll,
            "Quicker.Domain.Services.ISyncService",
            "Quicker.Domain.Services.SyncService");

        TestContext.WriteLine($"ISyncService methods ({methods.Count}):");
        foreach (var method in methods.OrderBy(m => m, StringComparer.Ordinal))
        {
            TestContext.WriteLine(method);
        }

        Assert.IsTrue(methods.Count > 0, "Expected ISyncService methods in Quicker.dll metadata.");
    }

    [TestMethod]
    public void V2_ActionItem2Store_exposes_save_methods()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var methods = ReadTypeMethods(quickerDll, "Quicker.Domain.Services.ActionItem2Store");

        TestContext.WriteLine($"ActionItem2Store methods ({methods.Count}):");
        foreach (var method in methods.OrderBy(m => m, StringComparer.Ordinal))
        {
            TestContext.WriteLine(method);
        }

        Assert.IsTrue(methods.Any(m => m.StartsWith("AddOrUpdateAction", StringComparison.Ordinal)));
    }

    public TestContext TestContext { get; set; } = null!;

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
            if (name.StartsWith('<'))
            {
                continue;
            }

            set.Add($"{ns}.{name}");
        }

        return set;
    }

    private static HashSet<string> ReadTypeMethods(string dllPath, params string[] fullTypeNames)
    {
        using var fs = File.OpenRead(dllPath);
        using var pe = new PEReader(fs);
        var reader = pe.GetMetadataReader();
        var wanted = new HashSet<string>(fullTypeNames, StringComparer.Ordinal);
        var methods = new HashSet<string>(StringComparer.Ordinal);

        foreach (var typeHandle in reader.TypeDefinitions)
        {
            var type = reader.GetTypeDefinition(typeHandle);
            var ns = reader.GetString(type.Namespace);
            var name = reader.GetString(type.Name);
            var fullName = $"{ns}.{name}";
            if (!wanted.Contains(fullName))
            {
                continue;
            }

            foreach (var methodHandle in type.GetMethods())
            {
                var method = reader.GetMethodDefinition(methodHandle);
                if (method.Attributes.HasFlag(MethodAttributes.SpecialName))
                {
                    continue;
                }

                var methodName = reader.GetString(method.Name);
                if (methodName.StartsWith("get_", StringComparison.Ordinal)
                    || methodName.StartsWith("set_", StringComparison.Ordinal)
                    || methodName.StartsWith("add_", StringComparison.Ordinal)
                    || methodName.StartsWith("remove_", StringComparison.Ordinal))
                {
                    continue;
                }

                methods.Add(methodName);
            }
        }

        return methods;
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
