using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class PackageDependencyResolverTests
{
    [TestMethod]
    public void TryNormalizeVersion_accepts_three_and_four_segments()
    {
        Assert.IsTrue(PackageDependencyResolver.TryNormalizeVersion("0.12.0", out var v3, out _));
        Assert.AreEqual("0.12.0.0", v3);

        Assert.IsTrue(PackageDependencyResolver.TryNormalizeVersion("0.12.0.3", out var v4, out _));
        Assert.AreEqual("0.12.0.3", v4);
    }

    [TestMethod]
    public void ToPackageVersionFolder_uses_first_three_segments()
    {
        Assert.AreEqual("0.12.0", PackageDependencyResolver.ToPackageVersionFolder("0.12.0.3"));
    }

    [TestMethod]
    public void TryResolve_quicker_rpc_picks_highest_plugin_dll_when_installed()
    {
        var packagesRoot = PackageDependencyResolver.ResolveDefaultPackagesRoot();
        var packageDir = Path.Combine(packagesRoot, "quicker.rpc", "0.12.0");
        if (!Directory.Exists(packageDir))
        {
            Assert.Inconclusive($"Local package not found: {packageDir}");
        }

        var result = PackageDependencyResolver.TryResolve(new PackageDependencyResolver.ResolveRequest
        {
            PackageName = "quicker.rpc",
            ZipFilename = "QuickerRpc.Plugin",
            Version = "0.12.0.0",
            PackagesRoot = packagesRoot,
        });

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.DllPath));
        StringAssert.Contains(result.DllPath!, "QuickerRpc.Plugin.");
        StringAssert.EndsWith(result.DllPath!, ".dll");
        Assert.IsTrue(File.Exists(result.DllPath!), result.DllPath);
        StringAssert.StartsWith(result.Version, "0.12.0.");
    }

    [TestMethod]
    public void IsDependencyDownloadSubprogram_recognizes_known_guids()
    {
        Assert.IsTrue(WorkspaceDependencyDownloadIds.IsDependencyDownloadSubprogram(
            "%%a7d5c0aa-80a5-4b5b-9bd1-a41bab5b2053"));
        Assert.IsTrue(WorkspaceDependencyDownloadIds.IsDependencyDownloadSubprogram(
            "9ed444ec-0899-48c3-8207-da51c4acec2f"));
        Assert.IsFalse(WorkspaceDependencyDownloadIds.IsDependencyDownloadSubprogram(
            "%%946adf53-9c75-4298-8dc5-8583d61fec1b"));
    }
}
