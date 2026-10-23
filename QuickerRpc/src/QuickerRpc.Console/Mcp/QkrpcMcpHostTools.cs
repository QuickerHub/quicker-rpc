using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpHostTools
{
    private readonly QkrpcMcpRuntime runtime;
    public QkrpcMcpHostTools(QkrpcMcpRuntime runtime) { this.runtime = runtime; }

    [McpServerTool(Name = "qkrpc_host_list")]
    [Description("Discover verified Quicker V1/V2 host sessions without starting a plugin. One compatible host is automatic; multiple require an explicit hostSessionId on source open or --host-session when starting MCP. Never retry a bound save on another host.")]
    public Task<string> List(CancellationToken cancellationToken = default) =>
        runtime.InvokeOpAsync("host.list", QkrpcMcpJson.ToElement(new { }), cancellationToken);
}
