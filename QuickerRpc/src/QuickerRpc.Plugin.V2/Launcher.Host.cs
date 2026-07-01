using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Plugin;

public static partial class Launcher
{
    private static IHost CreateHostForQuickerPlugin()
    {
        PluginV2DiagnosticLog.Write("CreateHostForQuickerPlugin begin");
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            throw new InvalidOperationException(
                "QuickerRpc.Plugin.V2 must run inside the Quicker V2 process.");
        }

        // ActionRuntimeLookupService may register after startup actions; do not block the RPC pipe.
        WaitForActionServicesIfNeeded();
        PluginV2DiagnosticLog.Write(
            QuickerV2ActionAccessor.Current is not null
                ? "Action services available"
                : "Action services still null after wait (continuing)");

        var host = Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Information));
                services.AddQuickerRpcPluginV2Core();
            })
            .Build();

        PluginV2DiagnosticLog.Write("CreateHostForQuickerPlugin built host");
        return host;
    }

    /// <summary>Brief wait so headless authoring works when started from QuickerAgent startup action.</summary>
    private static void WaitForActionServicesIfNeeded()
    {
        if (QuickerV2ActionAccessor.Current is not null)
        {
            return;
        }

        for (var attempt = 0; attempt < 20; attempt++)
        {
            Thread.Sleep(250);
            if (QuickerV2ActionAccessor.Current is not null)
            {
                return;
            }
        }
    }
}
