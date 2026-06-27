using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpCoreTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpCoreTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_health")]
    [Description("Check QuickerRpc plugin connectivity (ping). Requires Quicker running with QuickerRpc plugin loaded.")]
    public Task<string> QkrpcHealth(CancellationToken cancellationToken) =>
        _runtime.InvokeOpAsync("ping", default, cancellationToken);

    [McpServerTool(Name = "qkrpc_wait")]
    [Description(
        "Poll until QuickerRpc plugin is reachable (default timeout 120s, interval 2s). "
        + "Use when other qkrpc tools fail with connectivity errors — not shell ping/probe.")]
    public Task<string> QkrpcWait(
        [Description("Max wait seconds (default 120).")] int? timeoutSeconds = null,
        [Description("Poll interval seconds (default 2).")] int? intervalSeconds = null,
        [Description("Skip quicker:runaction bootstrap.")] bool noBootstrap = false,
        CancellationToken cancellationToken = default) =>
        _runtime.InvokeOpAsync(
            "wait",
            QkrpcMcpJson.ToElement(new
            {
                timeoutSeconds = timeoutSeconds ?? 120,
                intervalSeconds = intervalSeconds ?? 2,
                noBootstrap,
            }),
            cancellationToken);

}
