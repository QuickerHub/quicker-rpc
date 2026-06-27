using System;
using System.Collections.Generic;
using QuickerRpc.AgentModel.XAction.Testing;

namespace QuickerRpc.Plugin.Test;

/// <summary>Simulates 依赖下载_混合模式 using local <c>_packages</c> (no OSS download).</summary>
public sealed class WorkspaceDependencyDownloadSimulator
{
    public string? PackagesRoot { get; set; }

    public PackageDependencyResolver.ResolveResult TrySimulate(
        string packageName,
        string zipFilename,
        string version)
    {
        return PackageDependencyResolver.TryResolve(new PackageDependencyResolver.ResolveRequest
        {
            PackageName = packageName,
            ZipFilename = zipFilename,
            Version = version,
            PackagesRoot = PackagesRoot,
        });
    }

    public IReadOnlyDictionary<string, string> ToSubprogramOutputs(PackageDependencyResolver.ResolveResult result) =>
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["version"] = result.Version,
            ["package_path"] = result.PackagePath,
            ["package_version"] = result.PackageVersion,
            ["dll_path"] = result.DllPath,
            ["exe_path"] = result.ExePath,
            ["isSuccess"] = result.Success ? "true" : "false",
        };
}
