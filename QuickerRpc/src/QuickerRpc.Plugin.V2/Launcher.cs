using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Host;

namespace QuickerRpc.Plugin.V2;

/// <summary>Starts the named-pipe RPC server inside Quicker V2 (net10).</summary>
public static class Launcher
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

    /// <summary>Resolve <see cref="IQuickerRpcHost"/> from AppState and start the RPC server.</summary>
    public static void Start()
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
            var quickerHost = QuickerAppStateHostResolver.ResolveRequired();
            var host = Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
                .ConfigureServices(services =>
                {
                    services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Information));
                    services.AddQuickerRpcPluginV2(quickerHost);
                })
                .Build();

            host.Start();
            _host = host;
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
}

public enum LauncherStatus
{
    NotStarted,
    Starting,
    Started,
    Stopped,
}
