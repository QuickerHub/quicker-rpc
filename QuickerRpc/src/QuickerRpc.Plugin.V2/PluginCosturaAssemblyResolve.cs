using System.IO.Compression;
using System.Reflection;
using System.Threading;

namespace QuickerRpc.Plugin;

/// <summary>
/// Loads Costura-embedded satellite assemblies from this plugin DLL only.
/// Quicker V2 may resolve <c>QuickerRpc.*</c> by simple name to an older in-process copy; this handler wins first.
/// </summary>
internal static class PluginCosturaAssemblyResolve
{
    private static readonly Assembly PluginAssembly = typeof(PluginCosturaAssemblyResolve).Assembly;
    private static readonly Version PluginVersion = PluginAssembly.GetName().Version ?? new Version(0, 0, 0, 0);
    private static readonly string[] ForcedEmbeddedSatellites =
    [
        "StreamJsonRpc",
        "MessagePack",
        "Nerdbank.Streams",
        "Microsoft.VisualStudio.Threading",
        "Microsoft.VisualStudio.Validation",
    ];
    private static int _registered;

    internal static int EnsureRegistered()
    {
        if (Interlocked.Exchange(ref _registered, 1) != 0)
        {
            return 0;
        }

        // Register last so .NET 6+ invokes this handler before older Quicker host handlers.
        AppDomain.CurrentDomain.AssemblyResolve += OnResolve;
        PreloadSatellites();
        return 1;
    }

    /// <summary>Load embedded RPC satellites before Quicker host handlers bind a different copy.</summary>
    internal static void PreloadSatellites()
    {
        foreach (var name in ForcedEmbeddedSatellites)
        {
            try
            {
                _ = LoadFromEmbeddedResource(name);
            }
            catch
            {
                // optional satellites; Rpc session will retry resolve
            }
        }
    }

    private static Assembly? OnResolve(object? sender, ResolveEventArgs args)
    {
        var requested = new AssemblyName(args.Name);
        if (string.IsNullOrEmpty(requested.Name)
            || requested.Name.EndsWith(".resources", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!IsEmbeddedSatellite(requested.Name))
        {
            return null;
        }

        if (ShouldForceEmbeddedLoad(requested.Name))
        {
            return LoadFromEmbeddedResource(requested.Name);
        }

        var existing = FindLoadedExact(requested);
        if (existing is not null)
        {
            return existing;
        }

        return LoadFromEmbeddedResource(requested.Name);
    }

    private static bool IsEmbeddedSatellite(string simpleName)
    {
        foreach (var prefix in ForcedEmbeddedSatellites)
        {
            if (simpleName.StartsWith(prefix, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return simpleName.StartsWith("QuickerRpc.", StringComparison.Ordinal)
            || simpleName.StartsWith("Google.Protobuf", StringComparison.Ordinal);
    }

    private static bool ShouldForceEmbeddedLoad(string simpleName)
    {
        foreach (var prefix in ForcedEmbeddedSatellites)
        {
            if (simpleName.StartsWith(prefix, StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static Assembly? FindLoadedExact(AssemblyName requested)
    {
        foreach (var loaded in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (loaded.IsDynamic)
            {
                continue;
            }

            var loadedName = loaded.GetName();
            if (!string.Equals(loadedName.Name, requested.Name, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var version = loadedName.Version ?? new Version(0, 0, 0, 0);
            if (requested.Version is not null
                && version.Major == requested.Version.Major
                && version.Minor == requested.Version.Minor
                && version.Build == requested.Version.Build
                && version.Revision == requested.Version.Revision)
            {
                return loaded;
            }

            if (requested.Version is null && version == PluginVersion)
            {
                return loaded;
            }
        }

        return null;
    }

    private static Assembly? LoadFromEmbeddedResource(string simpleName)
    {
        var resourceBase = "costura." + simpleName.ToLowerInvariant();
        foreach (var suffix in new[] { ".dll.compressed", ".dll", ".exe.compressed", ".exe" })
        {
            var resourceName = resourceBase + suffix;
            using var stream = PluginAssembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                continue;
            }

            try
            {
                var bytes = suffix.EndsWith(".compressed", StringComparison.Ordinal)
                    ? Decompress(stream)
                    : ReadAllBytes(stream);
                return Assembly.Load(bytes);
            }
            catch
            {
                return null;
            }
        }

        return null;
    }

    private static byte[] Decompress(Stream compressed)
    {
        using var deflate = new DeflateStream(compressed, CompressionMode.Decompress);
        using var output = new MemoryStream();
        deflate.CopyTo(output);
        return output.ToArray();
    }

    private static byte[] ReadAllBytes(Stream stream)
    {
        using var output = new MemoryStream();
        stream.CopyTo(output);
        return output.ToArray();
    }
}
