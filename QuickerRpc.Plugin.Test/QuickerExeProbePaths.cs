using System;
using System.IO;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Resolves Debug vs Release <c>Quicker.exe</c> paths (see <c>qkref.props</c>, <c>quicker-exe-type-probing</c>).
/// Order: <c>QUICKER_DEBUG_DLL_PATH</c> / <c>QUICKER_DLL_PATH</c> → repo <c>.ref/Quicker/.../Quicker.exe</c> → default install dir.
/// </summary>
internal static class QuickerExeProbePaths
{
    public const string DefaultReleaseDirectory = @"C:\Program Files\Quicker";

    private const string RefQuickerDebugExeRelative =
        ".ref/Quicker/QuickerPc/Quicker/bin/x64/Debug/net472/Quicker.exe";

    public static string ResolveDebugQuickerExe()
    {
        var fromEnv = Environment.GetEnvironmentVariable("QUICKER_DEBUG_DLL_PATH")?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Path.Combine(fromEnv, "Quicker.exe");
        }

        var fromRef = Path.Combine(ResolveRepoRoot(), RefQuickerDebugExeRelative.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(fromRef))
        {
            return fromRef;
        }

        return fromRef;
    }

    public static string ResolveReleaseQuickerExe()
    {
        var fromEnv = Environment.GetEnvironmentVariable("QUICKER_DLL_PATH")?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Path.Combine(fromEnv, "Quicker.exe");
        }

        return Path.Combine(DefaultReleaseDirectory, "Quicker.exe");
    }

    private static string ResolveRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "version.json"))
                || Directory.Exists(Path.Combine(dir.FullName, "QuickerRpc.Plugin")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        return Directory.GetCurrentDirectory();
    }
}
