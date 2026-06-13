using System.Text.Json;
using QuickerRpc.Console.Serve;

namespace QuickerRpc.Console.Mcp;

/// <summary>Persistent RPC session for qkrpc mcp (stdio) tools.</summary>
public sealed class QkrpcMcpRuntime : IAsyncDisposable
{
    private static readonly HashSet<string> WorkspaceOps = new(StringComparer.OrdinalIgnoreCase)
    {
        "action.extract",
        "action.apply",
        "action.validate",
        "project.lint.schedule",
        "project.diagnostics.get",
        "subprogram.export",
        "subprogram.import",
    };

    private readonly QkrpcRpcSessionPool _pool;
    private readonly int _timeoutSeconds;
    private readonly QkrpcMcpWorkspaceContext _workspace;

    internal QkrpcMcpRuntime(
        int timeoutSeconds,
        bool tryBootstrap,
        QkrpcMcpWorkspaceContext workspace)
    {
        _timeoutSeconds = Math.Max(1, timeoutSeconds);
        _pool = new QkrpcRpcSessionPool(_timeoutSeconds, tryBootstrap);
        _workspace = workspace;
    }

    internal QkrpcMcpWorkspaceContext Workspace => _workspace;

    public string WorkspaceRoot => _workspace.PeekWorkspaceRoot() ?? string.Empty;

    public Task<string> ResolveWorkspaceRootAsync(CancellationToken cancellationToken = default) =>
        _workspace.RequireWorkspaceRootAsync(cancellationToken);

    public Task<string?> TryResolveWorkspaceRootAsync(CancellationToken cancellationToken = default) =>
        _workspace.TryResolveWorkspaceRootAsync(cancellationToken);

    public async Task<string> InvokeOpAsync(
        string op,
        JsonElement args,
        CancellationToken cancellationToken = default)
    {
        if (args.ValueKind == JsonValueKind.Object
            && args.TryGetProperty("parseError", out var parseError)
            && parseError.ValueKind == JsonValueKind.String)
        {
            return QkrpcMcpJson.FormatServeResponse(new ServeInvokeResponse
            {
                Ok = false,
                Error = "INVALID_ARGS_JSON",
                Message = parseError.GetString(),
            });
        }

        var normalizedOp = (op ?? string.Empty).Trim();
        var mergedArgs = await AttachWorkspaceRootAsync(normalizedOp, args, cancellationToken).ConfigureAwait(false);
        var response = await ServeInvokeDispatcher
            .InvokeAsync(_pool, normalizedOp, mergedArgs, _timeoutSeconds, cancellationToken)
            .ConfigureAwait(false);
        return QkrpcMcpJson.FormatServeResponse(response);
    }

    private async Task<JsonElement> AttachWorkspaceRootAsync(
        string op,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        if (!WorkspaceOps.Contains(op))
        {
            return args;
        }

        if (args.ValueKind == JsonValueKind.Object
            && args.TryGetProperty("workspaceRoot", out var existing)
            && existing.ValueKind == JsonValueKind.String
            && QkrpcMcpWorkspaceResolver.TryNormalizeRoot(existing.GetString(), out _))
        {
            return args;
        }

        var root = await _workspace.TryResolveWorkspaceRootAsync(cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(root))
        {
            return args;
        }

        var dict = new Dictionary<string, object?>();
        if (args.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in args.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.Clone();
            }
        }

        dict["workspaceRoot"] = root;
        return QkrpcMcpJson.ToElement(dict);
    }

    public async ValueTask DisposeAsync() => await _pool.DisposeAsync().ConfigureAwait(false);
}
