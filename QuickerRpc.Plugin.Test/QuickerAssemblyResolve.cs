using System;
using System.IO;
using System.Reflection;

namespace QuickerRpc.Plugin.Test;

/// <summary>Load Quicker host assemblies when tests run outside Quicker.exe.</summary>
internal static class QuickerAssemblyResolve
{
    private static int _registered;

    internal static void EnsureRegistered()
    {
        if (System.Threading.Interlocked.Exchange(ref _registered, 1) != 0)
        {
            return;
        }

        AppDomain.CurrentDomain.AssemblyResolve += OnResolve;
    }

    private static Assembly? OnResolve(object? sender, ResolveEventArgs args)
    {
        var assemblyName = new AssemblyName(args.Name).Name;
        if (string.IsNullOrEmpty(assemblyName))
        {
            return null;
        }

        var quickerDirectory = Path.GetDirectoryName(QuickerExeProbePaths.ResolveReleaseQuickerExe());
        if (string.IsNullOrEmpty(quickerDirectory))
        {
            return null;
        }

        var extension = string.Equals(assemblyName, "Quicker", StringComparison.OrdinalIgnoreCase)
            ? ".exe"
            : ".dll";
        var path = Path.Combine(quickerDirectory, assemblyName + extension);

        return File.Exists(path) ? Assembly.LoadFrom(path) : null;
    }
}
