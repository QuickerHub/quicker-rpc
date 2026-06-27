using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace QuickerRpc.AgentModel.XAction.Testing;

/// <summary>
/// Offline resolver for Quicker <c>_packages</c> dependency layout (same pick logic as 依赖下载_混合模式 s-15).
/// Does not download from OSS — uses an existing on-disk package directory.
/// </summary>
public static class PackageDependencyResolver
{
    public const string PackagesRootEnvVar = "QKRPC_PACKAGES_ROOT";

    public sealed class ResolveRequest
    {
        public string PackageName { get; set; } = string.Empty;

        public string ZipFilename { get; set; } = string.Empty;

        public string Version { get; set; } = "0.0.0.0";

        public string? PackagesRoot { get; set; }
    }

    public sealed class ResolveResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public string PackageVersion { get; set; } = string.Empty;

        public string PackagePath { get; set; } = string.Empty;

        public string DllPath { get; set; } = string.Empty;

        public string ExePath { get; set; } = string.Empty;

        /// <summary>Four-part version after picking highest revision artifact.</summary>
        public string Version { get; set; } = string.Empty;
    }

    public static string ResolveDefaultPackagesRoot()
    {
        var fromEnv = Environment.GetEnvironmentVariable(PackagesRootEnvVar)?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Path.GetFullPath(fromEnv);
        }

        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Quicker",
            "_packages");
    }

    public static ResolveResult TryResolve(ResolveRequest request)
    {
        var packageName = (request.PackageName ?? string.Empty).Trim();
        var zipFilename = (request.ZipFilename ?? string.Empty).Trim();
        if (packageName.Length == 0)
        {
            return Fail("package_name is required.");
        }

        if (zipFilename.Length == 0)
        {
            return Fail("zip_filename is required.");
        }

        if (!TryNormalizeVersion(request.Version, out var version4, out var error))
        {
            return Fail(error ?? "Invalid version.");
        }

        var packageVersion = ToPackageVersionFolder(version4);
        var packagesRoot = string.IsNullOrWhiteSpace(request.PackagesRoot)
            ? ResolveDefaultPackagesRoot()
            : Path.GetFullPath(request.PackagesRoot!);
        var packagePath = Path.Combine(packagesRoot, packageName, packageVersion);

        if (!Directory.Exists(packagePath))
        {
            return Fail($"Package directory not found: {packagePath}");
        }

        if (!Directory.EnumerateFileSystemEntries(packagePath).Any())
        {
            return Fail($"Package directory is empty: {packagePath}");
        }

        var prefix = zipFilename + ".";
        var dllPath = PickHighestVersionArtifact(packagePath, prefix, ".dll", out var pickedVersionFromDll);
        var exePath = PickHighestVersionArtifact(packagePath, prefix, ".exe", out _);
        var resolvedVersion = !string.IsNullOrWhiteSpace(pickedVersionFromDll)
            ? pickedVersionFromDll
            : version4;

        if (string.IsNullOrWhiteSpace(dllPath) && string.IsNullOrWhiteSpace(exePath))
        {
            return Fail(
                $"No matching {{prefix}}*.dll or {{prefix}}*.exe under {packagePath} (prefix={prefix}).");
        }

        return new ResolveResult
        {
            Success = true,
            PackageVersion = packageVersion,
            PackagePath = packagePath,
            DllPath = dllPath ?? string.Empty,
            ExePath = exePath ?? string.Empty,
            Version = resolvedVersion,
        };
    }

    public static bool TryNormalizeVersion(string? version, out string version4, out string? error)
    {
        version4 = string.Empty;
        error = null;
        var parts = (version ?? string.Empty).Trim().Split('.');
        if (parts.Length == 3)
        {
            version4 = string.Join(".", parts) + ".0";
            return true;
        }

        if (parts.Length == 4)
        {
            version4 = string.Join(".", parts);
            return true;
        }

        error = $"version must be 3 or 4 segments, got '{version}'.";
        return false;
    }

    public static string ToPackageVersionFolder(string version4)
    {
        var parts = version4.Split('.');
        return parts.Length >= 3
            ? string.Join(".", parts.Take(3))
            : version4;
    }

    private static string? PickHighestVersionArtifact(
        string packagePath,
        string prefix,
        string extension,
        out string? versionFromName)
    {
        versionFromName = null;
        var candidates = Directory
            .GetFiles(packagePath)
            .Where(path =>
            {
                var name = Path.GetFileName(path);
                return name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(Path.GetExtension(path), extension, StringComparison.OrdinalIgnoreCase);
            })
            .OrderByDescending(path => ParseArtifactVersion(path, prefix), VersionComparer.Instance)
            .ToList();

        if (candidates.Count == 0)
        {
            return null;
        }

        var picked = candidates[0];
        versionFromName = ExtractVersionSuffix(Path.GetFileNameWithoutExtension(picked), prefix);
        return picked;
    }

    private static Version ParseArtifactVersion(string path, string prefix)
    {
        var versionText = ExtractVersionSuffix(Path.GetFileNameWithoutExtension(path), prefix);
        return Version.TryParse(versionText, out var version)
            ? version
            : new Version(0, 0, 0, 0);
    }

    private static string ExtractVersionSuffix(string fileNameWithoutExtension, string prefix)
    {
        return fileNameWithoutExtension.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            ? fileNameWithoutExtension.Substring(prefix.Length)
            : "0.0.0.0";
    }

    private static ResolveResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };

    private sealed class VersionComparer : IComparer<Version>
    {
        internal static readonly VersionComparer Instance = new();

        public int Compare(Version? x, Version? y) => (x ?? new Version(0, 0, 0, 0)).CompareTo(y ?? new Version(0, 0, 0, 0));
    }
}
