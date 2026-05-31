using System;
using System.IO;

namespace QuickerRpc.Plugin.Test;

/// <summary>Resolves Debug vs Release <c>Quicker.exe</c> paths (see <c>qkref.props</c>).</summary>
internal static class QuickerExeProbePaths
{
    public const string DefaultDebugDirectory =
        @"D:\source\repos\quicker\quickerorg\Quicker\QuickerPc\Quicker\bin\x64\Debug\net472";

    public const string DefaultReleaseDirectory = @"C:\Program Files\Quicker";

    public static string ResolveDebugQuickerExe()
    {
        var fromEnv = Environment.GetEnvironmentVariable("QUICKER_DEBUG_DLL_PATH")?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Path.Combine(fromEnv, "Quicker.exe");
        }

        return Path.Combine(DefaultDebugDirectory, "Quicker.exe");
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
}
