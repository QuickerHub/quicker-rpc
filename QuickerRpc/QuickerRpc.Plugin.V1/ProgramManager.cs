using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace QuickerRpc.Plugin;

/// <summary>
/// Finds other loaded QuickerRpc plugin assemblies and invokes their <see cref="Launcher.Exit"/>.
/// </summary>
public static class ProgramManager
{
    public const string AssemblyNamePrefix = "QuickerRpc.Plugin";

    public static Version CurrentVersion { get; } = Assembly.GetExecutingAssembly().GetName().Version
        ?? new Version(0, 0, 0, 0);

    public static IEnumerable<Assembly> GetRunningPluginAssemblies()
    {
        var current = Assembly.GetExecutingAssembly();
        return AppDomain.CurrentDomain.GetAssemblies()
            .Where(a =>
            {
                var name = a.GetName().Name;
                return name is not null
                    && name.StartsWith(AssemblyNamePrefix, StringComparison.Ordinal)
                    && !string.Equals(a.FullName, current.FullName, StringComparison.Ordinal);
            });
    }

    /// <summary>Ask other QuickerRpc.Plugin.* versions to call <see cref="Launcher.Exit"/>.</summary>
    public static void ExitOtherVersionPlugins()
    {
        foreach (var assembly in GetRunningPluginAssemblies())
        {
            try
            {
                var launcherType = assembly.GetType(typeof(Launcher).FullName, throwOnError: false);
                var exit = launcherType?.GetMethod(
                    nameof(Launcher.Exit),
                    BindingFlags.Public | BindingFlags.Static);
                exit?.Invoke(null, null);
            }
            catch
            {
                // Ignore unload/race errors when replacing plugin versions.
            }
        }
    }
}
