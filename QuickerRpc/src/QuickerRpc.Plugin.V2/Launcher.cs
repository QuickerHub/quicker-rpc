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
    private static IHost? _host;
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

    /// <summary>Build reflection-based <see cref="IQuickerRpcHost"/> and start the RPC server.</summary>
    private static void StartCore()
    {
        lock (LockObject)
        {
            if (_status == LauncherStatus.Started)
            {
                return;
            }

            _status = LauncherStatus.Starting;
        }

        try
        {
            var external = QuickerV2ExternalHostResolver.TryResolve();
            _host = external is not null
                ? CreateHostWithExternalQuickerHost(external)
                : CreateHostForQuickerPlugin();

            _host.Start();
            _status = LauncherStatus.Started;
        }
        catch
        {
            _status = LauncherStatus.NotStarted;
            throw;
        }
    }

    public static async Task StopAsync()
    {
        IHost? host;
        lock (LockObject)
        {
            host = _host;
            _host = null;
            _status = LauncherStatus.Stopped;
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
