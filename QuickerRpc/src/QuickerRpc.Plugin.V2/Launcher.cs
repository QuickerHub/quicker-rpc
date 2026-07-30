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
    private static readonly object LockObject = new();
    private static readonly Lazy<IHost> HostLazy = new(
        CreateHostForQuickerPlugin,
        LazyThreadSafetyMode.ExecutionAndPublication);

    private static IHost? _host;
    private static QuickerRpcServerHost? _serverHost;
    private static LauncherStatus _status = LauncherStatus.NotStarted;
    private static volatile bool _launchQuickerAgentAfterStart;

    public static LauncherStatus Status
    {
        get
        {
            lock (LockObject)
            {
                return _status;
            }
        }
    }

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

        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                PluginV2DiagnosticLog.Write("Start skipped: already Started");
                TryLaunchQuickerAgentIfRequested();
                return;
            }

            if (_status == LauncherStatus.Starting)
            {
                PluginV2DiagnosticLog.Write("Start skipped: already Starting");
                return;
            }

            if (_status == LauncherStatus.Stopped)
            {
                PluginV2DiagnosticLog.Write("Start skipped: Stopped");
                return;
            }

            _status = LauncherStatus.Starting;
        }

        PluginV2DiagnosticLog.Write("Start queued on thread pool");
        _ = Task.Run(StartCoreAsync).ContinueWith(
            static task =>
            {
                if (task.IsFaulted && task.Exception is not null)
                {
                    PluginV2DiagnosticLog.Write(
                        "StartCoreAsync faulted (unobserved)",
                        task.Exception.GetBaseException());
                }
            },
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);
    }

    private static async Task StartCoreAsync()
    {
        try
        {
            PluginV2DiagnosticLog.Write("StartCoreAsync begin");
            var external = QuickerV2ExternalHostResolver.TryResolve();

            if (external is not null)
            {
                PluginV2DiagnosticLog.Write("Using external Quicker V2 host from AppState DI");
                var host = CreateHostWithExternalQuickerHost(external);
                PluginV2DiagnosticLog.Write("Host built; starting RPC server host");
                await StartRpcServerFromHostAsync(host).ConfigureAwait(false);
                lock (LockObject)
                {
                    if (_status != LauncherStatus.Starting)
                    {
                        return;
                    }

                    _host = host;
                    _status = LauncherStatus.Started;
                }
            }
            else
            {
                PluginV2DiagnosticLog.Write("Building manual bootstrap RPC stack (reflection adapters)");
                await StartRpcServerManualAsync().ConfigureAwait(false);
                lock (LockObject)
                {
                    if (_status != LauncherStatus.Starting)
                    {
                        return;
                    }

                    _status = LauncherStatus.Started;
                }
            }

            PluginV2DiagnosticLog.Write("QuickerRpc V2 launcher Started");
            TryLaunchQuickerAgentIfRequested();
        }
        catch (Exception ex)
        {
            lock (LockObject)
            {
                if (_status == LauncherStatus.Starting)
                {
                    _status = LauncherStatus.NotStarted;
                }
            }

            PluginV2DiagnosticLog.Write("StartCoreAsync failed", ex);
            throw;
        }
    }

    private static async Task StartRpcServerManualAsync()
    {
        await Task.Delay(250, CancellationToken.None).ConfigureAwait(false);

        var loggerFactory = LoggerFactory.Create(builder => builder.SetMinimumLevel(LogLevel.Information));
        PluginV2DiagnosticLog.Write("Creating QuickerRpcServerHost (manual stack)");
        var serverHost = PluginV2BootstrapStack.CreateServerHost(loggerFactory);
        PluginV2DiagnosticLog.Write("Calling QuickerRpcServerHost.StartAsync");
        await serverHost.StartAsync(CancellationToken.None).ConfigureAwait(false);
        _serverHost = serverHost;
    }

    private static async Task StartRpcServerFromHostAsync(IHost host)
    {
        await Task.Delay(250, CancellationToken.None).ConfigureAwait(false);
        PluginV2DiagnosticLog.Write("Resolving QuickerRpcServerHost from DI host");
        var serverHost = host.Services.GetRequiredService<QuickerRpcServerHost>();
        await serverHost.StartAsync(CancellationToken.None).ConfigureAwait(false);
        _serverHost = serverHost;
    }

    public static async Task StopAsync()
    {
        IHost? host;
        QuickerRpcServerHost? serverHost;
        lock (LockObject)
        {
            host = _host ?? (HostLazy.IsValueCreated ? HostLazy.Value : null);
            serverHost = _serverHost;
            _host = null;
            _serverHost = null;
            _status = LauncherStatus.Stopped;
        }

        if (serverHost is not null)
        {
            await serverHost.StopAsync(CancellationToken.None).ConfigureAwait(false);
        }

        if (host is not null)
        {
            await host.StopAsync().ConfigureAwait(false);
            host.Dispose();
        }
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

public enum LauncherStatus
{
    NotStarted,
    Starting,
    Started,
    Stopped,
}
