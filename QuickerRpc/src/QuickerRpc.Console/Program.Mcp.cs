using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using QuickerRpc.Console.Mcp;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunMcpAsync(McpOptions options)
    {
        if (string.Equals(options.Command, "install", StringComparison.OrdinalIgnoreCase))
        {
            return await QkrpcMcpInstaller.RunAsync(options).ConfigureAwait(false);
        }

        var workspaceContext = new QkrpcMcpWorkspaceContext();
        await using var runtime = new QkrpcMcpRuntime(options.TimeoutSeconds, !options.NoBootstrap, workspaceContext);

        var builder = Host.CreateApplicationBuilder(Array.Empty<string>());
        builder.Logging.ClearProviders();
        builder.Logging.AddConsole(consoleLogOptions =>
        {
            consoleLogOptions.LogToStandardErrorThreshold = LogLevel.Trace;
        });

        builder.Services.AddSingleton(workspaceContext);
        builder.Services.AddSingleton(runtime);
        builder.Services.AddHostedService<QkrpcMcpWorkspaceHostedService>();
        builder.Services
            .AddMcpServer()
            .WithStdioServerTransport()
            .WithToolsFromAssembly(typeof(QkrpcMcpRuntime).Assembly)
            .WithResourcesFromAssembly(typeof(QkrpcMcpRuntime).Assembly);

        try
        {
            await builder.Build().RunAsync().ConfigureAwait(false);
            return ExitCodes.Success;
        }
        catch (OperationCanceledException)
        {
            return ExitCodes.Success;
        }
    }
}
