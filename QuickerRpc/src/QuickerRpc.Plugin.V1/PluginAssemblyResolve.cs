using System;
using System.IO;
using System.Reflection;
using System.Threading;

namespace QuickerRpc.Plugin;

/// <summary>
/// Resolves satellite DLLs from the plugin package directory (e.g. Microsoft.Extensions.* on disk).
/// Registered before any other static initialization in <see cref="Launcher"/>.
/// </summary>
internal static class PluginAssemblyResolve
{
    private static readonly string PluginDirectory =
        Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty;

    private static int _registered;

    /// <summary>Idempotent; safe to call from field initializer before DI host creation.</summary>
    internal static int EnsureRegistered()
    {
        if (Interlocked.Exchange(ref _registered, 1) != 0)
        {
            return 1;
        }

        AppDomain.CurrentDomain.AssemblyResolve += OnResolve;
        return 1;
    }

    private static Assembly? OnResolve(object? sender, ResolveEventArgs args)
    {
        if (string.IsNullOrEmpty(PluginDirectory))
        {
            return null;
        }

        var name = new AssemblyName(args.Name).Name;
        if (string.IsNullOrEmpty(name) || name.EndsWith(".resources", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        // Costura-embedded plugin satellites must not load from disk (version skew with Quicker host resolve).
        if (name.StartsWith("QuickerRpc.", StringComparison.Ordinal)
            || name.StartsWith("Google.Protobuf", StringComparison.Ordinal)
            || name.StartsWith("StreamJsonRpc", StringComparison.Ordinal)
            || name.StartsWith("MessagePack", StringComparison.Ordinal)
            || name.StartsWith("Nerdbank.Streams", StringComparison.Ordinal))
        {
            return null;
        }

        var path = Path.Combine(PluginDirectory, name + ".dll");
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            return Assembly.LoadFrom(path);
        }
        catch
        {
            return null;
        }
    }
}
