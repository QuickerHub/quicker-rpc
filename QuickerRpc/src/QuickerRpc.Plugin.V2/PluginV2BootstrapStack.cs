using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Runtime;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin;

/// <summary>
/// Manual RPC stack wiring for plugin bootstrap. Avoids MS DI resolving <see cref="IQuickerRpcHost"/>
/// during QuickerAgent startup (container + UI-thread deadlock on remote V2).
/// </summary>
internal static class PluginV2BootstrapStack
{
    internal static QuickerRpcServerHost CreateServerHost(ILoggerFactory loggerFactory)
    {
        var programs = new V2HeadlessActionProgramService();
        var subPrograms = new V2HeadlessSubProgramService(programs);
        var catalog = new V2HeadlessCatalogService();

        var quickerHost = new V2QuickerRpcHost(
            new V2SessionHost(),
            new V2ActionProgramHost(programs),
            new V2ActionSharingHost(),
            new V2SubProgramHost(subPrograms),
            new V2ActionRunHost(),
            new V2ActionCatalogHost(),
            new V2SearchHost(catalog, programs),
            new V2SettingsHost(),
            new V2ActionDocHost(),
            new V2StepRunnerHost(programs),
            new V2ExpressionHost());

        var runtimeDeps = new QuickerRpcRuntimeDependencies(
            QuickerV2StepRunnerCatalogBuilder.Build,
            catalogReadSource: "v2-reflection");

        var rpcService = new QuickerRpcService(
            quickerHost,
            new InlineQuickerRpcCallScheduler(),
            new NoOpQuickerRpcUserFeedback(),
            new ActionProgramRpcHandler(runtimeDeps),
            new SubProgramRpcHandler(runtimeDeps));

        return new QuickerRpcServerHost(
            rpcService,
            loggerFactory.CreateLogger<QuickerRpcServerHost>());
    }
}
