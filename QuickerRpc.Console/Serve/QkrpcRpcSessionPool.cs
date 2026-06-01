using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>Single persistent JSON-RPC session to Quicker (serialized calls).</summary>
internal sealed class QkrpcRpcSessionPool : IAsyncDisposable
{
    private readonly int _connectTimeoutSeconds;
    private readonly bool _tryBootstrap;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private QuickerRpcClientSession? _session;

    public QkrpcRpcSessionPool(int connectTimeoutSeconds, bool tryBootstrap)
    {
        _connectTimeoutSeconds = Math.Max(1, connectTimeoutSeconds);
        _tryBootstrap = tryBootstrap;
    }

    public async Task<IQuickerRpcService> GetRpcAsync(CancellationToken cancellationToken)
    {
        var session = await GetSessionAsync(cancellationToken).ConfigureAwait(false);
        return session.Rpc;
    }

    public async Task<QuickerRpcClientSession> GetSessionAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_session is not null)
            {
                return _session;
            }

            _session = await QuickerRpcClient
                .ConnectAsync(_connectTimeoutSeconds, _tryBootstrap, cancellationToken)
                .ConfigureAwait(false);
            return _session;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task InvalidateAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_session is not null)
            {
                await _session.DisposeAsync().ConfigureAwait(false);
                _session = null;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await InvalidateAsync().ConfigureAwait(false);
        _gate.Dispose();
    }
}
