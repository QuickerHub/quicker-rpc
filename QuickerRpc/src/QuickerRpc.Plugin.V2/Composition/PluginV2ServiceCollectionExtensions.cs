using Microsoft.Extensions.DependencyInjection;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Runtime;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin.V2.Composition;

public static class PluginV2ServiceCollectionExtensions
{
    /// <summary>Wires Transport + Runtime using a pre-resolved Quicker V2 host (tests or explicit DI).</summary>
    public static IServiceCollection AddQuickerRpcPluginV2(
        this IServiceCollection services,
        IQuickerRpcHost quickerHost)
    {
        ArgumentNullException.ThrowIfNull(quickerHost);

        services.AddSingleton(quickerHost);
        services.AddSingleton<IQuickerRpcCallScheduler, InlineQuickerRpcCallScheduler>();
        services.AddSingleton<IQuickerRpcUserFeedback, NoOpQuickerRpcUserFeedback>();

        var runtimeDeps = new QuickerRpcRuntimeDependencies(
            GetStepRunnerCatalog,
            catalogReadSource: "v2-host");

        services.AddSingleton(runtimeDeps);
        services.AddSingleton(_ => new ActionProgramRpcHandler(runtimeDeps));
        services.AddSingleton(_ => new SubProgramRpcHandler(runtimeDeps));
        services.AddSingleton<QuickerRpcService>();
        services.AddSingleton<IQuickerRpcService>(sp => sp.GetRequiredService<QuickerRpcService>());
        services.AddSingleton<QuickerRpcServerHost>();
        services.AddHostedService(sp => sp.GetRequiredService<QuickerRpcServerHost>());

        return services;
    }

    // TODO(P4.1): map IQuickerRpcStepRunnerHost.ListAsync → StepRunnerCatalog when Infrastructure exposes catalog API.
    private static StepRunnerCatalog GetStepRunnerCatalog() => new();
}
