using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Threading;

namespace QuickerRpc.Plugin;

/// <summary>
/// Loads Costura-embedded satellite assemblies from this plugin DLL only.
/// Private release simple names isolate old handlers; this handler serves only its own assembly graph.
/// </summary>
internal static class PluginCosturaAssemblyResolve
{
    private static readonly Assembly PluginAssembly = typeof(PluginCosturaAssemblyResolve).Assembly;
    private static readonly object ResourceLock = new();
    private static readonly Dictionary<string, EmbeddedAssembly?> Resources = new(StringComparer.OrdinalIgnoreCase);
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

        // Earlier handlers still run first. Versioned private simple names prevent them claiming this graph.
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

        if (!IsEmbeddedSatellite(requested.Name) || !OwnsRequester(args.RequestingAssembly))
        {
            return null;
        }

        var resource = ReadEmbeddedAssembly(requested.Name);
        if (resource is null || !SameIdentity(requested, resource.Identity)) return null;
        var existing = FindLoadedExact(resource);
        if (existing is not null)
        {
            return existing;
        }

        return LoadEmbedded(resource);
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

    private static bool OwnsRequester(Assembly? requester)
    {
        if (ReferenceEquals(requester, PluginAssembly)) return true;
        if (requester is null || requester.IsDynamic) return false;
        var name = requester.GetName();
        if (name.Name is null || !IsEmbeddedSatellite(name.Name)) return false;
        var resource = ReadEmbeddedAssembly(name.Name);
        return resource is not null && MatchesImage(requester, resource);
    }

    private static bool SameIdentity(AssemblyName left, AssemblyName right) =>
        string.Equals(left.Name, right.Name, StringComparison.OrdinalIgnoreCase)
        && left.Version is not null && left.Version == right.Version
        && string.Equals(left.CultureName ?? "", right.CultureName ?? "", StringComparison.OrdinalIgnoreCase)
        && left.ContentType == right.ContentType
        && (left.Flags & AssemblyNameFlags.Retargetable) == (right.Flags & AssemblyNameFlags.Retargetable)
        && (left.GetPublicKeyToken() ?? []).SequenceEqual(right.GetPublicKeyToken() ?? []);

    private static bool MatchesImage(Assembly assembly, EmbeddedAssembly resource) =>
        SameIdentity(assembly.GetName(), resource.Identity) && assembly.ManifestModule.ModuleVersionId == resource.Mvid;

    private static Assembly? FindLoadedExact(EmbeddedAssembly resource)
    {
        foreach (var loaded in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (loaded.IsDynamic)
            {
                continue;
            }

            if (MatchesImage(loaded, resource)) return loaded;
        }

        return null;
    }

    private static Assembly? LoadFromEmbeddedResource(string simpleName)
    {
        var resource = ReadEmbeddedAssembly(simpleName);
        return resource is null ? null : LoadEmbedded(resource);
    }

    private static Assembly? LoadEmbedded(EmbeddedAssembly resource) => resource.Loaded.Value;

    private static Assembly? LoadImage(EmbeddedAssembly resource)
    {
        var loaded = FindLoadedExact(resource) ?? Assembly.Load(resource.Bytes);
        return MatchesImage(loaded, resource) ? loaded : null;
    }

    private sealed class EmbeddedAssembly
    {
        public byte[] Bytes { get; }
        public AssemblyName Identity { get; }
        public Guid Mvid { get; }
        public Lazy<Assembly?> Loaded { get; }

        public EmbeddedAssembly(byte[] bytes, AssemblyName identity, Guid mvid)
        {
            Bytes = bytes; Identity = identity; Mvid = mvid;
            // Concurrent first requests must not publish duplicate no-context type identities.
            Loaded = new Lazy<Assembly?>(() => LoadImage(this), LazyThreadSafetyMode.ExecutionAndPublication);
        }
    }

    private static EmbeddedAssembly? ReadEmbeddedAssembly(string simpleName)
    {
        lock (ResourceLock)
        {
            if (!Resources.TryGetValue(simpleName, out var resource))
                Resources[simpleName] = resource = ReadEmbeddedAssemblyCore(simpleName);
            return resource;
        }
    }

    private static EmbeddedAssembly? ReadEmbeddedAssemblyCore(string simpleName)
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
                // Validate identity before loading any embedded code. The requester must match this exact image too.
                using var image = new PEReader(new MemoryStream(bytes, writable: false));
                var metadata = image.GetMetadataReader();
                var definition = metadata.GetAssemblyDefinition();
                var identity = new AssemblyName
                {
                    Name = metadata.GetString(definition.Name), Version = definition.Version,
                    CultureName = metadata.GetString(definition.Culture),
                };
                identity.SetPublicKey(metadata.GetBlobBytes(definition.PublicKey));
                if (!string.Equals(identity.Name, simpleName, StringComparison.OrdinalIgnoreCase)) return null;
                return new EmbeddedAssembly(bytes, identity, metadata.GetGuid(metadata.GetModuleDefinition().Mvid));
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
