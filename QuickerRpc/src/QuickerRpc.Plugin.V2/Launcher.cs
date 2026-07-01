using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Quicker.Public.Interfaces;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
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
    /// V2 ignores <paramref name="context"/> until start-option parity is implemented.
    /// </summary>
    public static void Start(IActionContext? context = null) =>
        StartCore();

    /// <summary>Build reflection-based host and start the RPC server without blocking the UI thread.</summary>
    private static void StartCore()
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                PluginV2DiagnosticLog.Write("Start skipped: already Started");
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
