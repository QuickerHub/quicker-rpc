using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

/// <summary>Runtime workspace root for MCP: follows agent workspace with optional fixed override.</summary>
internal sealed class QkrpcMcpWorkspaceContext
{
    private readonly object _sync = new();
    private string? _rootsCache;
    private McpServer? _server;
    private bool _rootsHandlerRegistered;

    internal string? PeekWorkspaceRoot()
    {
        lock (_sync)
        {
            if (!string.IsNullOrWhiteSpace(_rootsCache))
            {
                return _rootsCache;
            }
        }

        return QkrpcMcpWorkspaceResolver.ResolveFromEnvironment();
    }

    internal void BindServer(McpServer server)
    {
        _server = server;
        RegisterRootsChangedHandler(server);
        _ = RefreshRootsCacheAsync(CancellationToken.None);
    }

    internal async Task<string> RequireWorkspaceRootAsync(CancellationToken cancellationToken)
    {
        var cached = PeekWorkspaceRoot();
        if (!string.IsNullOrWhiteSpace(cached))
        {
            return cached;
        }

        var fromRoots = await TryResolveFromRootsAsync(cancellationToken).ConfigureAwait(false);
        if (!string.IsNullOrWhiteSpace(fromRoots))
        {
            return fromRoots;
        }

        throw new InvalidOperationException(
            "Workspace root is not set. Open a project folder in your MCP host, or run: "
            + "qkrpc agent setup --workspace <path> for a fixed workspace.");
    }

    internal async Task<string?> TryResolveWorkspaceRootAsync(CancellationToken cancellationToken)
    {
        var cached = PeekWorkspaceRoot();
        if (!string.IsNullOrWhiteSpace(cached))
        {
            return cached;
        }

        return await TryResolveFromRootsAsync(cancellationToken).ConfigureAwait(false);
    }

    private void RegisterRootsChangedHandler(McpServer server)
    {
        if (_rootsHandlerRegistered)
        {
            return;
        }

        _rootsHandlerRegistered = true;
        server.RegisterNotificationHandler(
            NotificationMethods.RootsListChangedNotification,
            async (_, cancellationToken) =>
            {
                await RefreshRootsCacheAsync(cancellationToken).ConfigureAwait(false);
            });
    }

    private async Task RefreshRootsCacheAsync(CancellationToken cancellationToken)
    {
        _ = await TryResolveFromRootsAsync(cancellationToken).ConfigureAwait(false);
    }

    private async Task<string?> TryResolveFromRootsAsync(CancellationToken cancellationToken)
    {
        var server = _server;
        if (server?.ClientCapabilities?.Roots is null)
        {
            return null;
        }

        try
        {
            var result = await server
                .RequestRootsAsync(new ListRootsRequestParams(), cancellationToken)
                .ConfigureAwait(false);

            foreach (var root in result.Roots)
            {
                if (!QkrpcMcpWorkspaceResolver.TryParseFileRootUri(root.Uri, out var workspaceRoot))
                {
                    continue;
                }

                lock (_sync)
                {
                    _rootsCache = workspaceRoot;
                }

                return workspaceRoot;
            }
        }
        catch
        {
            // Host may not expose roots yet; fall back to env-based resolution.
        }

        return null;
    }
}
