using Microsoft.Extensions.DependencyInjection;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Adapters;

internal static class V1ResourceCatalogServices
{
    internal static IServiceCollection AddV1ResourceCatalog(this IServiceCollection services)
    {
        services.AddSingleton<V1ResourceCatalogCapture>();
        services.AddHostedService(sp => sp.GetRequiredService<V1ResourceCatalogCapture>());
        services.AddSingleton<V1ResourceCatalogPageHost>();
        return services;
    }
}
