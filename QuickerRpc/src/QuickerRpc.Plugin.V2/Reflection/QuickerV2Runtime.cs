using System.Reflection;

namespace QuickerRpc.Plugin.V2.Reflection;

/// <summary>
/// V2 service locator: prefers <c>Launcher.GetService</c>, falls back to legacy <c>AppState.GetService</c>.
/// Types may live in satellite assemblies (Common, Utilities, StepEngine), not only <c>Quicker.dll</c>.
/// </summary>
internal static class QuickerV2Runtime
{
    private static readonly Lazy<Type?> LauncherType = new(ResolveLauncherType);
    private static readonly Lazy<Type?> AppStateType = new(ResolveAppStateType);
    private static readonly Lazy<Assembly?> QuickerAssemblyLazy = new(ResolveQuickerAssembly);

    public static bool IsRunningInQuicker =>
        string.Equals(Assembly.GetEntryAssembly()?.GetName().Name, "Quicker", StringComparison.Ordinal);

    public static Assembly? QuickerAssembly => QuickerAssemblyLazy.Value;

    public static Type? ResolveType(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
        {
            return null;
        }

        foreach (var assembly in EnumerateQuickerAssemblies())
        {
            var type = TryGetType(assembly, fullName);
            if (type is not null)
            {
                return type;
            }
        }

        return null;
    }

    public static object? TryGetService(Type serviceType)
    {
        if (serviceType is null || !IsRunningInQuicker)
        {
            return null;
        }

        foreach (var hostType in new[] { LauncherType.Value, AppStateType.Value })
        {
            var fromHost = TryGetServiceFromType(hostType, serviceType);
            if (fromHost is not null)
            {
                return fromHost;
            }
        }

        return TryGetServiceFromServiceProvider(serviceType);
    }

    public static T? TryGetService<T>() where T : class =>
        TryGetService(typeof(T)) as T;

    public static string TryGetQuickerVersion()
    {
        try
        {
            return QuickerAssembly?.GetName().Version?.ToString() ?? string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>Human-readable probe summary when V2 accessors fail to initialize.</summary>
    public static string DescribeActionServiceProbe()
    {
        if (!IsRunningInQuicker)
        {
            return "entry assembly is not Quicker.";
        }

        var parts = new List<string>();
        foreach (var name in new[]
                 {
                     QuickerV2TypeNames.ActionRuntimeLookupService,
                     QuickerV2TypeNames.ActionItem2Store,
                     QuickerV2TypeNames.ActionItem2Extensions,
                     QuickerV2TypeNames.ActionItem2,
                 })
        {
            var type = ResolveType(name);
            if (type is null)
            {
                parts.Add($"type missing: {name}");
                continue;
            }

            var service = name is QuickerV2TypeNames.ActionItem2Extensions or QuickerV2TypeNames.ActionItem2
                ? null
                : TryGetService(type);
            parts.Add(service is null && name is not QuickerV2TypeNames.ActionItem2Extensions and not QuickerV2TypeNames.ActionItem2
                ? $"service null: {name} ({type.Assembly.GetName().Name})"
                : $"ok: {name} ({type.Assembly.GetName().Name})");
        }

        if (LauncherType.Value is null)
        {
            parts.Add("Launcher type not found.");
        }

        if (AppStateType.Value is null)
        {
            parts.Add("AppState type not found.");
        }

        return string.Join("; ", parts);
    }

    internal static IEnumerable<Assembly> EnumerateQuickerAssemblies()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (!IsQuickerSatelliteAssembly(assembly))
            {
                continue;
            }

            if (seen.Add(assembly.FullName ?? assembly.GetName().Name ?? assembly.Location))
            {
                yield return assembly;
            }
        }

        var quickerDir = QuickerAssembly?.Location is { Length: > 0 } location
            ? Path.GetDirectoryName(location)
            : null;
        if (quickerDir is null)
        {
            yield break;
        }

        foreach (var fileName in new[]
                 {
                     "Quicker.dll",
                     "Quicker.Common.dll",
                     "Quicker.Utilities.dll",
                     "Quicker.StepEngine.dll",
                     "Quicker.Contracts.dll",
                 })
        {
            var path = Path.Combine(quickerDir, fileName);
            if (!File.Exists(path))
            {
                continue;
            }

            Assembly assembly;
            try
            {
                assembly = Assembly.LoadFrom(path);
            }
            catch
            {
                continue;
            }

            if (seen.Add(assembly.FullName ?? assembly.GetName().Name ?? assembly.Location))
            {
                yield return assembly;
            }
        }
    }

    private static bool IsQuickerSatelliteAssembly(Assembly assembly)
    {
        if (assembly.IsDynamic)
        {
            return false;
        }

        var name = assembly.GetName().Name ?? string.Empty;
        return name.Equals("Quicker", StringComparison.OrdinalIgnoreCase)
               || name.StartsWith("Quicker.", StringComparison.OrdinalIgnoreCase);
    }

    private static Type? TryGetType(Assembly assembly, string fullName)
    {
        try
        {
            var direct = assembly.GetType(fullName, throwOnError: false, ignoreCase: false);
            if (direct is not null)
            {
                return direct;
            }

            foreach (var type in EnumerateTypes(assembly))
            {
                if (string.Equals(type.FullName, fullName, StringComparison.Ordinal))
                {
                    return type;
                }
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static IEnumerable<Type> EnumerateTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex) when (ex.Types is not null)
        {
            return ex.Types.Where(t => t is not null)!;
        }
        catch
        {
            return Array.Empty<Type>();
        }
    }

    private static Assembly? ResolveQuickerAssembly()
    {
        var entry = Assembly.GetEntryAssembly();
        if (string.Equals(entry?.GetName().Name, "Quicker", StringComparison.Ordinal))
        {
            return entry;
        }

        return AppDomain.CurrentDomain.GetAssemblies()
            .FirstOrDefault(a => string.Equals(a.GetName().Name, "Quicker", StringComparison.Ordinal));
    }

    private static Type? ResolveLauncherType() =>
        ResolveType(QuickerV2TypeNames.Launcher);

    private static Type? ResolveAppStateType() =>
        ResolveType(QuickerV2TypeNames.AppState);

    private static object? TryGetServiceFromType(Type? hostType, Type serviceType)
    {
        if (hostType is null)
        {
            return null;
        }

        try
        {
            var generic = hostType.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "GetService", StringComparison.Ordinal)
                    && m.IsGenericMethodDefinition
                    && m.GetParameters().Length == 0);
            if (generic is not null)
            {
                return generic.MakeGenericMethod(serviceType).Invoke(null, null);
            }
        }
        catch
        {
            // fall through
        }

        try
        {
            var nonGeneric = hostType.GetMethod(
                "GetService",
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                binder: null,
                types: [typeof(Type)],
                modifiers: null);
            return nonGeneric?.Invoke(null, [serviceType]);
        }
        catch
        {
            return null;
        }
    }

    private static object? TryGetServiceFromServiceProvider(Type serviceType)
    {
        foreach (var hostType in new[] { LauncherType.Value, AppStateType.Value })
        {
            if (hostType is null)
            {
                continue;
            }

            object? provider;
            try
            {
                provider = hostType.GetProperty(
                        "Services",
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                    ?.GetValue(null)
                    ?? hostType.GetProperty(
                        "ServiceProvider",
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)
                    ?.GetValue(null);
            }
            catch
            {
                continue;
            }

            if (provider is null)
            {
                continue;
            }

            try
            {
                var getService = provider.GetType().GetMethod(
                    "GetService",
                    BindingFlags.Public | BindingFlags.Instance,
                    binder: null,
                    types: [typeof(Type)],
                    modifiers: null);
                var resolved = getService?.Invoke(provider, [serviceType]);
                if (resolved is not null)
                {
                    return resolved;
                }
            }
            catch
            {
                // try next host
            }
        }

        return null;
    }
}
