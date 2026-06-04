using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerAgentInstallProbe
{
    private const string ProductName = "QuickerAgent";
    private const string ExecutableName = "quicker-agent.exe";

    public static bool TryGetInstalledVersion(out string? version, out string? installDirectory)
    {
        version = null;
        installDirectory = null;

        if (TryGetFromRegistry(out version, out installDirectory))
        {
            return SemVerUtility.TryParse(version, out _);
        }

        foreach (var candidate in EnumerateCandidateExecutables())
        {
            if (!File.Exists(candidate))
            {
                continue;
            }

            var fileVersion = TryReadFileVersion(candidate);
            if (string.IsNullOrWhiteSpace(fileVersion))
            {
                continue;
            }

            version = fileVersion.Trim();
            installDirectory = Path.GetDirectoryName(candidate);
            return SemVerUtility.TryParse(version, out _);
        }

        return false;
    }

    public static bool TryGetExecutablePath(out string? executablePath)
    {
        executablePath = null;

        if (TryGetFromRegistry(out _, out var installDirectory)
            && !string.IsNullOrWhiteSpace(installDirectory))
        {
            var fromRegistry = Path.Combine(installDirectory, ExecutableName);
            if (File.Exists(fromRegistry))
            {
                executablePath = fromRegistry;
                return true;
            }
        }

        foreach (var candidate in EnumerateCandidateExecutables())
        {
            if (File.Exists(candidate))
            {
                executablePath = candidate;
                return true;
            }
        }

        return false;
    }

    private static bool TryGetFromRegistry(out string? version, out string? installDirectory)
    {
        version = null;
        installDirectory = null;

        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        {
            if (TryGetFromRegistryRoot(hive, RegistryView.Default, out version, out installDirectory))
            {
                return true;
            }

            if (Environment.Is64BitOperatingSystem
                && TryGetFromRegistryRoot(hive, RegistryView.Registry32, out version, out installDirectory))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryGetFromRegistryRoot(
        RegistryHive hive,
        RegistryView view,
        out string? version,
        out string? installDirectory)
    {
        version = null;
        installDirectory = null;

        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, view);
            using var uninstall = baseKey.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstall is null)
            {
                return false;
            }

            foreach (var subKeyName in uninstall.GetSubKeyNames())
            {
                using var entry = uninstall.OpenSubKey(subKeyName);
                if (entry is null)
                {
                    continue;
                }

                var displayName = (entry.GetValue("DisplayName") as string)?.Trim();
                if (!string.Equals(displayName, ProductName, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                version = (entry.GetValue("DisplayVersion") as string)?.Trim();
                installDirectory = NormalizeDirectory(entry.GetValue("InstallLocation") as string);
                if (string.IsNullOrWhiteSpace(installDirectory))
                {
                    installDirectory = NormalizeDirectoryFromIcon(entry.GetValue("DisplayIcon") as string);
                }

                return !string.IsNullOrWhiteSpace(version);
            }
        }
        catch
        {
            return false;
        }

        return false;
    }

    private static IEnumerable<string> EnumerateCandidateExecutables()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        yield return Path.Combine(localAppData, ProductName, ExecutableName);
        yield return Path.Combine(localAppData, "Programs", ProductName, ExecutableName);

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (!string.IsNullOrWhiteSpace(programFiles))
        {
            yield return Path.Combine(programFiles, ProductName, ExecutableName);
        }
    }

    private static string? TryReadFileVersion(string path)
    {
        try
        {
            var info = FileVersionInfo.GetVersionInfo(path);
            var productVersion = (info.ProductVersion ?? string.Empty).Trim();
            if (SemVerUtility.TryParse(productVersion, out _))
            {
                return productVersion.Split('+')[0].Trim();
            }

            var fileVersion = (info.FileVersion ?? string.Empty).Trim();
            return string.IsNullOrWhiteSpace(fileVersion) ? null : fileVersion.Split('+')[0].Trim();
        }
        catch
        {
            return null;
        }
    }

    private static string? NormalizeDirectory(string? path)
    {
        var trimmed = (path ?? string.Empty).Trim().Trim('"');
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static string? NormalizeDirectoryFromIcon(string? displayIcon)
    {
        var trimmed = (displayIcon ?? string.Empty).Trim().Trim('"');
        if (trimmed.Length == 0)
        {
            return null;
        }

        var comma = trimmed.IndexOf(',');
        if (comma >= 0)
        {
            trimmed = trimmed.Substring(0, comma).Trim().Trim('"');
        }

        return Path.GetDirectoryName(trimmed);
    }
}
