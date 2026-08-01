using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class QuickerV2SavePathProbeTests
{
    private static readonly string HostRoot = ResolveHostRoot();

    [TestMethod]
    public void V2_Quicker_dll_lists_save_and_sync_writer_types()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var patterns = new[]
        {
            "TriggerCommand",
            "SaveGlobal",
            "SyncV5Local",
            "LocalDataWriter",
            "GlobalSubProgram",
            "SubProgramCommand",
            "SubProgramStore",
        };

        var types = ReadTypeNames(quickerDll)
            .Where(t => patterns.Any(p => t.Contains(p, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();

        TestContext.WriteLine($"matched types ({types.Count}):");
        foreach (var type in types)
        {
            TestContext.WriteLine(type);
        }

        Assert.IsTrue(types.Count > 0, "Expected save/sync writer related types.");
    }

    [TestMethod]
    public void V2_all_quicker_dlls_list_syncv5_writer_types()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        foreach (var dll in Directory.EnumerateFiles(HostRoot, "Quicker*.dll"))
        {
            var types = ReadTypeNames(dll)
                .Where(t => t.Contains("SyncV5", StringComparison.OrdinalIgnoreCase)
                            || t.Contains("DataWriter", StringComparison.OrdinalIgnoreCase)
                            || t.Contains("TriggerCommand", StringComparison.OrdinalIgnoreCase))
                .OrderBy(t => t, StringComparer.Ordinal)
                .ToList();
            if (types.Count == 0)
            {
                continue;
            }

            TestContext.WriteLine($"{Path.GetFileName(dll)} ({types.Count}):");
            foreach (var type in types)
            {
                TestContext.WriteLine("  " + type);
            }
        }
    }

    [TestMethod]
    public void V2_GlobalSubProgram_related_types_in_Quicker_dll()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var types = ReadTypeNames(quickerDll)
            .Where(t => t.Contains("SubProgram", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("GlobalSub", StringComparison.OrdinalIgnoreCase))
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();

        TestContext.WriteLine($"subprogram-related types ({types.Count}):");
        foreach (var type in types)
        {
            TestContext.WriteLine(type);
        }
    }

    [TestMethod]
    public void V2_GlobalSubProgramListViewModel_public_methods()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var methods = ReadTypeMethods(
            quickerDll,
            "Quicker.ActionDesigner.ViewModels.GlobalSubProgramListViewModel");

        TestContext.WriteLine($"GlobalSubProgramListViewModel methods ({methods.Count}):");
        foreach (var method in methods.OrderBy(m => m, StringComparer.Ordinal))
        {
            TestContext.WriteLine(method);
        }
    }

    [TestMethod]
    public void V2_KeyedReactiveStore_and_persist_types()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var types = ReadTypeNames(quickerDll)
            .Where(t => t.Contains("KeyedReactive", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("ReactiveStore", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("Persist", StringComparison.OrdinalIgnoreCase)
                        || t.Contains("DataItem", StringComparison.OrdinalIgnoreCase))
            .OrderBy(t => t, StringComparer.Ordinal)
            .Take(40)
            .ToList();

        TestContext.WriteLine($"reactive/persist types ({types.Count}):");
        foreach (var type in types)
        {
            TestContext.WriteLine(type);
        }
    }

    [TestMethod]
    public void V2_SyncV5LocalSyncState_public_methods()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var methods = ReadTypeMethods(
            quickerDll,
            "Quicker.Domain.Services.SyncV5.SyncV5LocalSyncState");

        TestContext.WriteLine($"SyncV5LocalSyncState methods ({methods.Count}):");
        foreach (var method in methods.OrderBy(m => m, StringComparer.Ordinal))
        {
            TestContext.WriteLine(method);
        }
    }

    [TestMethod]
    public void V2_command_and_mediator_types_for_subprogram_save()
    {
        if (!Directory.Exists(HostRoot))
        {
            Assert.Inconclusive($"V2 host root not found: {HostRoot}");
        }

        var quickerDll = Path.Combine(HostRoot, "Quicker.dll");
        var types = ReadTypeNames(quickerDll)
            .Where(t => (t.Contains("Command", StringComparison.OrdinalIgnoreCase)
                         || t.Contains("Mediator", StringComparison.OrdinalIgnoreCase)
                         || t.Contains("Handler", StringComparison.OrdinalIgnoreCase))
                        && t.Contains("SubProgram", StringComparison.OrdinalIgnoreCase))
            .OrderBy(t => t, StringComparer.Ordinal)
            .ToList();

        TestContext.WriteLine($"command/mediator subprogram types ({types.Count}):");
        foreach (var type in types)
        {
            TestContext.WriteLine(type);
        }
    }

    public TestContext TestContext { get; set; } = null!;

    private static HashSet<string> ReadTypeNames(string dllPath)
    {
        using var fs = File.OpenRead(dllPath);
        using var pe = new PEReader(fs);
        if (!pe.HasMetadata)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

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
