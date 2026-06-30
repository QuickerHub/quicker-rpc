using Microsoft.Extensions.DependencyInjection;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Runtime;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin.V2.Composition;

public static class PluginV2ServiceCollectionExtensions
{
    /// <summary>Registers reflection-based V2 host adapters + Transport + Runtime.</summary>
    public static IServiceCollection AddQuickerRpcPluginV2Core(this IServiceCollection services)
    {
        services.AddSingleton<V2HeadlessActionProgramService>();
        services.AddSingleton<V2HeadlessSubProgramService>();
        services.AddSingleton<V2HeadlessCatalogService>();

        services.AddSingleton<V2SessionHost>();
        services.AddSingleton<V2ActionProgramHost>();
        services.AddSingleton<V2ActionSharingHost>();
        services.AddSingleton<V2SubProgramHost>();
        services.AddSingleton<V2ActionRunHost>();
        services.AddSingleton<V2ActionCatalogHost>();
        services.AddSingleton<V2SearchHost>();
        services.AddSingleton<V2SettingsHost>();
        services.AddSingleton<V2ActionDocHost>();
        services.AddSingleton<V2StepRunnerHost>();
        services.AddSingleton<V2ExpressionHost>();
        services.AddSingleton<V2QuickerRpcHost>();
        services.AddSingleton<IQuickerRpcHost>(sp => sp.GetRequiredService<V2QuickerRpcHost>());

        return services.AddQuickerRpcPluginV2(sp => sp.GetRequiredService<IQuickerRpcHost>());
    }

    /// <summary>Wires Transport + Runtime using a pre-resolved Quicker V2 host (tests or external DI).</summary>
    public static IServiceCollection AddQuickerRpcPluginV2(
        this IServiceCollection services,
        IQuickerRpcHost quickerHost) =>
        services.AddQuickerRpcPluginV2(_ => quickerHost);

    private static IServiceCollection AddQuickerRpcPluginV2(
        this IServiceCollection services,
        Func<IServiceProvider, IQuickerRpcHost> hostFactory)
    {
        services.AddSingleton(hostFactory);
        services.AddSingleton<IQuickerRpcCallScheduler, InlineQuickerRpcCallScheduler>();
        services.AddSingleton<IQuickerRpcUserFeedback, NoOpQuickerRpcUserFeedback>();

        var runtimeDeps = new QuickerRpcRuntimeDependencies(
            QuickerV2StepRunnerCatalogBuilder.Build,
            catalogReadSource: "v2-reflection");

        services.AddSingleton(runtimeDeps);
        services.AddSingleton(sp => new ActionProgramRpcHandler(sp.GetRequiredService<QuickerRpcRuntimeDependencies>()));
        services.AddSingleton(sp => new SubProgramRpcHandler(sp.GetRequiredService<QuickerRpcRuntimeDependencies>()));
        services.AddSingleton<QuickerRpcService>();
        services.AddSingleton<IQuickerRpcService>(sp => sp.GetRequiredService<QuickerRpcService>());
        services.AddSingleton<QuickerRpcServerHost>();
        services.AddHostedService(sp => sp.GetRequiredService<QuickerRpcServerHost>());

        return services;
    }
}
