using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ModelContextProtocol.Server;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Console.Mcp;

internal static class McpRpcBridge
{
    public static async Task<McpRpcSession> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap,
        CancellationToken cancellationToken)
    {
        var (pipe, jsonRpc, proxy) = await QuickerRpcConnect
            .ConnectAsync(timeoutSeconds, tryBootstrap)
            .ConfigureAwait(false);
        return new McpRpcSession(pipe, jsonRpc, proxy);
    }
}

internal sealed class McpRpcSession : IAsyncDisposable
{
    private readonly System.IO.Pipes.NamedPipeClientStream _pipe;
    private readonly JsonRpc _jsonRpc;

    public McpRpcSession(
        System.IO.Pipes.NamedPipeClientStream pipe,
        JsonRpc jsonRpc,
        IQuickerRpcService proxy)
    {
        _pipe = pipe;
        _jsonRpc = jsonRpc;
        Proxy = proxy;
    }

    public IQuickerRpcService Proxy { get; }

    public async ValueTask DisposeAsync()
    {
        _jsonRpc.Dispose();
        await _pipe.DisposeAsync().ConfigureAwait(false);
    }
}

internal static class McpHostRunner
{
    public static async Task RunAsync(int timeoutSeconds, bool tryBootstrap, CancellationToken cancellationToken)
    {
        var builder = Host.CreateApplicationBuilder();
        builder.Logging.AddConsole(consoleLogOptions =>
        {
            consoleLogOptions.LogToStandardErrorThreshold = LogLevel.Trace;
        });

        builder.Services.AddSingleton(new QuickerActionMcpTools(timeoutSeconds, tryBootstrap));
        builder.Services
            .AddMcpServer()
            .WithStdioServerTransport()
            .WithTools<QuickerActionMcpTools>();

        await builder.Build().RunAsync(cancellationToken).ConfigureAwait(false);
    }
}
