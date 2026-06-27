using Microsoft.Extensions.Hosting;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

internal sealed class QkrpcMcpWorkspaceHostedService : IHostedService
{
    private readonly QkrpcMcpWorkspaceContext _workspaceContext;
    private readonly McpServer _server;

    public QkrpcMcpWorkspaceHostedService(QkrpcMcpWorkspaceContext workspaceContext, McpServer server)
    {
        _workspaceContext = workspaceContext;
        _server = server;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _workspaceContext.BindServer(_server);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
