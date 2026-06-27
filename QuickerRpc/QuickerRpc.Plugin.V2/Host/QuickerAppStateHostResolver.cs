using System.Reflection;
using QuickerRpc.Host;

namespace QuickerRpc.Plugin.V2.Host;

/// <summary>
/// Resolves <see cref="IQuickerRpcHost"/> registered by Quicker.Infrastructure (V2).
/// Uses reflection only — no compile-time reference to Quicker.exe.
/// </summary>
public static class QuickerAppStateHostResolver
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    public static IQuickerRpcHost? TryResolve()
    {
        var appStateType = FindAppStateType();
        if (appStateType is null)
        {
            return null;
        }

        return TryGetService(appStateType, typeof(IQuickerRpcHost)) as IQuickerRpcHost;
    }

    public static IQuickerRpcHost ResolveRequired()
    {
        var host = TryResolve();
        if (host is null)
        {
            throw new InvalidOperationException(
                "IQuickerRpcHost is not registered in AppState. "
                + "Register Quicker.Infrastructure.QuickerRpc.Host (AddQuickerRpcHostV2) before starting QuickerRpc.Plugin.V2.");
        }

        if (host.Info.Kind != QuickerHostKind.V2)
        {
            throw new InvalidOperationException(
                $"Expected QuickerHostKind.V2, got {host.Info.Kind}. Use QuickerRpc.Plugin.V1 for legacy Quicker builds.");
        }

        return host;
    }

    private static Type? FindAppStateType()
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            var type = assembly.GetType("Quicker.Domain.AppState", throwOnError: false);
            if (type is not null)
            {
                return type;
            }
        }

        return null;
    }

    private static object? TryGetService(Type appStateType, Type serviceType)
    {
        try
        {
            var generic = appStateType.GetMethods(StaticFlags)
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
            var nonGeneric = appStateType.GetMethod(
                "GetService",
                StaticFlags,
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
}
