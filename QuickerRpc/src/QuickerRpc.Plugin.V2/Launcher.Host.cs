using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Plugin;

public static partial class Launcher
{
    private static IHost CreateHostForQuickerPlugin()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            throw new InvalidOperationException(
                "QuickerRpc.Plugin.V2 must run inside the Quicker V2 process.");
        }

        if (QuickerV2ActionAccessor.Current is null)
        {
            throw new InvalidOperationException(
                "Quicker V2 action services are unavailable. "
                + "Ensure ActionRuntimeLookupService and ActionItem2Store are registered. "
                + "Probe: "
                + QuickerV2Runtime.DescribeActionServiceProbe());
        }

        var host = Microsoft.Extensions.Hosting.Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                services.AddLogging(builder => builder.SetMinimumLevel(LogLevel.Information));
                services.AddQuickerRpcPluginV2Core();
            })
            .Build();

        return host;
    }
}
