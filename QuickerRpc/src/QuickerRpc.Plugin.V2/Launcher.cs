using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Quicker.Public.Interfaces;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Host;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Runtime;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin;

/// <summary>Starts the named-pipe RPC server inside Quicker (V2 net10 host).</summary>
public static partial class Launcher
{
    private static readonly V2LauncherLifetime Lifetime = new(CreateStartupOwner, () =>
    {
        PluginV2DiagnosticLog.Write("QuickerRpc V2 launcher Started");
        TryLaunchQuickerAgentIfRequested();
    });
    private static volatile bool _launchQuickerAgentAfterStart;

    public static LauncherStatus Status => Lifetime.Status;

    /// <summary>
    /// Same entry as Plugin.V1: <c>Launcher.Start(_context)</c> from QuickerRpc_Run / QExpr.
    /// Options are resolved from the root action trigger and <c>quicker_in_param</c>.
    /// </summary>
    public static void Start(IActionContext? context = null) =>
        StartCore(LauncherStartOptionsResolver.Resolve(context));

    /// <summary>Same as <see cref="Start"/> but with an explicit <c>quicker_in_param</c>.</summary>
    public static void StartFromQuickerInParam(string? quickerInParam, IActionContext? context = null) =>
        StartCore(LauncherStartOptionsResolver.Resolve(context, quickerInParam));

    /// <summary>Starts RPC only (no QuickerAgent UI).</summary>
    public static void StartPluginOnly(IActionContext? context = null, bool notifyVersion = false) =>
        StartCore(
            notifyVersion
                ? LauncherStartOptionsParser.PluginOnlyWithVersionNotify()
                : LauncherStartOptionsParser.PluginOnly());

    /// <summary>Starts RPC and opens the QuickerAgent desktop app.</summary>
    public static void StartWithQuickerAgent(IActionContext? context = null) =>
        StartCore(new LauncherStartOptions
        {
            LaunchQuickerAgent = true,
            Silent = false,
        });

    /// <summary>Build reflection-based host and start the RPC server without blocking the UI thread.</summary>
    private static void StartCore(LauncherStartOptions? options = null)
    {
        if (options?.KillQuickerAgent == true)
        {
            PluginV2DiagnosticLog.Write("Kill QuickerAgent requested");
            _ = Task.Run(() => QuickerAgentKillService.TryForceExit(NullLogger.Instance));
            return;
        }

        if (options?.LaunchQuickerAgent == true)
        {
            _launchQuickerAgentAfterStart = true;
        }

        if (options?.NotifyPluginVersion == true)
        {
            PluginV2DiagnosticLog.Write("Plugin version " + GetPluginVersion());
        }

        if (!Lifetime.TryStart(out var startup))
        {
            var status = Lifetime.Status;
            PluginV2DiagnosticLog.Write("Start skipped: " + status);
            if (status == LauncherStatus.Started) TryLaunchQuickerAgentIfRequested();
            return;
        }

        PluginV2DiagnosticLog.Write("Start queued on thread pool");
        _ = startup.ContinueWith(
            static task => PluginV2DiagnosticLog.Write(
                "StartCoreAsync failed", task.Exception!.GetBaseException()),
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);
    }

    private static LauncherStartupOwner CreateStartupOwner()
    {
        IHost? host = null;
        QuickerRpcServerHost? serverHost = null;
        ILoggerFactory? loggerFactory = null;
        return new LauncherStartupOwner(
            async cancellationToken =>
            {
                PluginV2DiagnosticLog.Write("StartCoreAsync begin");
                var external = QuickerV2ExternalHostResolver.TryResolve();
                if (external is not null)
                {
                    PluginV2DiagnosticLog.Write("Using external Quicker V2 host from AppState DI");
                    host = CreateHostWithExternalQuickerHost(external);
                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                    PluginV2DiagnosticLog.Write("Resolving QuickerRpcServerHost from DI host");
                    serverHost = host.Services.GetRequiredService<QuickerRpcServerHost>();
                }
                else
                {
                    await Task.Delay(250, cancellationToken).ConfigureAwait(false);
                    loggerFactory = LoggerFactory.Create(builder => builder.SetMinimumLevel(LogLevel.Information));
                    PluginV2DiagnosticLog.Write("Creating QuickerRpcServerHost (manual stack)");
                    serverHost = PluginV2BootstrapStack.CreateServerHost(loggerFactory);
                }

                await serverHost.StartAsync(cancellationToken).ConfigureAwait(false);
            },
            async () =>
            {
                try
                {
                    if (serverHost is not null)
                        await serverHost.StopAsync(CancellationToken.None).ConfigureAwait(false);
                }
                finally
                {
                    if (host is not null) await host.StopAsync().ConfigureAwait(false);
                }
            },
            () =>
            {
                try { host?.Dispose(); }
                finally { loggerFactory?.Dispose(); }
            });
    }

    public static Task StopAsync()
    {
        _launchQuickerAgentAfterStart = false;
        return Lifetime.StopAsync();
    }

    private static void TryLaunchQuickerAgentIfRequested()
    {
        if (!_launchQuickerAgentAfterStart)
        {
            return;
        }

        _launchQuickerAgentAfterStart = false;
        _ = Task.Run(() =>
        {
            try
            {
                var outcome = QuickerAgentLaunchService.TryLaunchOrActivate(NullLogger.Instance);
                PluginV2DiagnosticLog.Write("QuickerAgent launch outcome: " + outcome);
            }
            catch (Exception ex)
            {
                PluginV2DiagnosticLog.Write("QuickerAgent launch failed", ex);
            }
        });
    }

    private static string GetPluginVersion() =>
        System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";

    private static IHost CreateHostWithExternalQuickerHost(IQuickerRpcHost quickerHost)
    {
        return Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Information));
                services.AddQuickerRpcPluginV2(quickerHost);
            })
            .Build();
    }
}
