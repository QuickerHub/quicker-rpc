using System;
using Microsoft.Extensions.DependencyInjection;

namespace QuickerRpc.Plugin;

/// <summary>
/// Global DI accessor after <see cref="Microsoft.Extensions.Hosting.IHost"/> is built (IntelliTools-style).
/// </summary>
public static class AppServices
{
    private static IServiceProvider? _provider;

    public static bool IsInitialized => _provider is not null;

    public static void Initialize(IServiceProvider provider)
    {
        _provider = provider ?? throw new ArgumentNullException(nameof(provider));
    }

    public static IServiceProvider Provider =>
        _provider ?? throw new InvalidOperationException("AppServices has not been initialized.");

    public static T GetRequired<T>()
        where T : class =>
        Provider.GetRequiredService<T>();

    public static object GetRequired(Type serviceType) =>
        Provider.GetRequiredService(serviceType);
}
