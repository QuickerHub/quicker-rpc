using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Adapters;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.Services.Search;
using QuickerRpc.Runtime;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin;

public static partial class Launcher
{
    private static IHost CreateHostForQuickerPlugin()
    {
        var host = Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
            .ConfigureServices((_, services) =>
            {
                services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Information));

                services.AddSingleton<IPopupMessageService>(PopupMessage.Default);
                services.AddSingleton<AgentSearchHub>();
                services.AddSingleton<AgentSearchIndexCoordinator>();
                services.AddHostedService<AgentSearchIndexWarmupService>();
                services.AddSingleton<ActionUpdateService>();
                services.AddSingleton<ActionPublishService>();
                services.AddSingleton<ActionDocService>();
                services.AddSingleton<ActionSearchService>();
                services.AddSingleton<SubProgramSearchService>();
                services.AddSingleton<ActionDeleteService>();
                services.AddSingleton<ActionMoveService>();
                services.AddSingleton<GlobalProfileCreateService>();
                services.AddSingleton<ProfileDeleteService>();
                services.AddSingleton<VirtualProcessCreateService>();
                services.AddSingleton<ActionCreateService>();
                services.AddSingleton<ActionEditService>();
                services.AddSingleton<ActionRunService>();
                services.AddSingleton<XActionTraceRunService>();
                services.AddSingleton<ActionFloatService>();
                services.AddSingleton<HeadlessVariableEditService>();
                services.AddSingleton<HeadlessActionProgramService>();
                services.AddSingleton<HeadlessSubProgramProgramService>();
                services.AddSingleton<FontAwesomeIconSearchService>();
                services.AddSingleton<CodeSyntaxCheckService>();
                services.AddSingleton<ExpressionExecuteService>();
                services.AddSingleton<ChromeControlExecuteService>();
                services.AddSingleton<TextToolRunService>();
                services.AddSingleton<QuickerSettingsService>();
                services.AddSingleton<QuickerSettingsUiService>();
                services.AddSingleton<TriggerTaskService>();
                services.AddSingleton<LauncherResolveService>();
                services.AddSingleton<QuickerAgentUpdateCheckService>();
                services.AddHostedService<ActionDesignerWindowWatcher>();

                services.AddSingleton<V1SessionHost>();
                services.AddSingleton<V1ActionProgramHost>();
                services.AddSingleton<V1ActionSharingHost>();
                services.AddSingleton<V1SubProgramHost>();
                services.AddSingleton<V1ActionRunHost>();
                services.AddSingleton<V1ActionCatalogHost>();
                services.AddSingleton<V1SearchHost>();
                services.AddSingleton<V1SettingsHost>();
                services.AddSingleton<V1ActionDocHost>();
                services.AddSingleton<V1StepRunnerHost>();
                services.AddSingleton<V1ExpressionHost>();
                services.AddSingleton<V1ChromeControlHost>();
                services.AddSingleton<V1TriggerHost>();
                services.AddSingleton<V1DesignerHost>();
                services.AddSingleton<V1LauncherHost>();
                services.AddSingleton<V1QuickerRpcHost>();
                services.AddSingleton<IQuickerRpcHost>(sp => sp.GetRequiredService<V1QuickerRpcHost>());

                services.AddSingleton<IQuickerRpcCallScheduler, WpfQuickerRpcCallScheduler>();
                services.AddSingleton<IQuickerRpcUserFeedback, PopupQuickerRpcUserFeedback>();

                services.AddSingleton<ActionProgramRpcHandler>(_ => new ActionProgramRpcHandler(
                    new QuickerRpcRuntimeDependencies(
                        StepRunnerCatalogFromQuicker.Build,
                        ActionDesignerProgramBridge.ReadSourceCatalog),
                    new ActionProgramDesignerBridge()));

                services.AddSingleton<SubProgramRpcHandler>(_ => new SubProgramRpcHandler(
                    new QuickerRpcRuntimeDependencies(
                        StepRunnerCatalogFromQuicker.Build,
                        ActionDesignerProgramBridge.ReadSourceCatalog),
                    new SubProgramDesignerBridge()));

                services.AddSingleton<QuickerRpcService>();
                services.AddSingleton<IQuickerRpcService>(sp => sp.GetRequiredService<QuickerRpcService>());

                services.AddSingleton<QuickerRpcServerHost>();
                services.AddHostedService(sp => sp.GetRequiredService<QuickerRpcServerHost>());
            })
            .Build();

        AppServices.Initialize(host.Services);
        return host;
    }
}
