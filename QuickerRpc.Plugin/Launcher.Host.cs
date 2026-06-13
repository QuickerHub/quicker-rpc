using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.AgentModel.Search;
using QuickerRpc.Plugin.Quicker;
using QuickerRpc.Plugin.Rpc;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.Services.Search;

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
                services.AddSingleton<QuickerSettingsService>();
                services.AddSingleton<QuickerSettingsUiService>();
                services.AddSingleton<TriggerTaskService>();
                services.AddSingleton<LauncherResolveService>();
                services.AddSingleton<QuickerAgentUpdateCheckService>();
                services.AddHostedService<ActionDesignerWindowWatcher>();
                services.AddSingleton<QuickerRpcService>();
                services.AddSingleton<IQuickerRpcService>(sp => sp.GetRequiredService<QuickerRpcService>());

                services.AddSingleton<QuickerRpcServer>();
                services.AddHostedService(sp => sp.GetRequiredService<QuickerRpcServer>());
            })
            .Build();

        AppServices.Initialize(host.Services);
        return host;
    }
}
