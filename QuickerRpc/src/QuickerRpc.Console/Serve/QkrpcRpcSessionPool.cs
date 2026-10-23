using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>Persistent sessions pinned to bootstrap identity; creation and disposal are serialized.</summary>
internal sealed class QkrpcRpcSessionPool : IAsyncDisposable
{
    private readonly int _connectTimeoutSeconds;
    private readonly bool _tryBootstrap;
    private readonly QuickerRpcHostSelection? _selection;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private QuickerRpcClientSession? _session;
    private QuickerRpcHostBinding? _binding;
    private bool _legacySelected;
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, QkrpcRpcSessionPool> _boundPools = new();

    public QuickerRpcHostBinding? Binding => _binding;

    public QkrpcRpcSessionPool ForBinding(QuickerRpcHostBinding binding) =>
        _binding?.SameDestination(binding) == true ? this : _boundPools.GetOrAdd(binding.Endpoint + "\0" + binding.HostInstanceId + "\0" + binding.HostSessionId,
            _ => new QkrpcRpcSessionPool(_connectTimeoutSeconds, false) { _binding = binding });

    public QkrpcRpcSessionPool(int connectTimeoutSeconds, bool tryBootstrap, QuickerRpcHostSelection? selection = null)
    {
        _connectTimeoutSeconds = Math.Max(1, connectTimeoutSeconds);
        _tryBootstrap = tryBootstrap;
        _selection = selection;
    }

    public async Task<IQuickerRpcService> GetRpcAsync(CancellationToken cancellationToken, IReadOnlyList<string>? requiredCapabilities = null)
    {
        var session = await GetSessionAsync(cancellationToken, requiredCapabilities).ConfigureAwait(false);
        return session.Rpc;
    }

    public async Task<QuickerRpcClientSession> GetSessionAsync(CancellationToken cancellationToken, IReadOnlyList<string>? requiredCapabilities = null)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_session is not null)
            {
                return _session;
            }

            if (_legacySelected)
                throw new QuickerRpcClientException(QuickerRpcBindingErrors.Required, "The legacy connection was lost. Start a new explicit connection.");
            if (_binding is not null)
                _session = await QuickerRpcClient.ConnectBoundAsync(_binding, _connectTimeoutSeconds, cancellationToken: cancellationToken).ConfigureAwait(false);
            else if ((requiredCapabilities is null && _selection is null) || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING")))
                _session = await QuickerRpcClient.ConnectAsync(_connectTimeoutSeconds, _tryBootstrap, cancellationToken).ConfigureAwait(false);
            else
                _session = await QuickerRpcClient.ConnectSelectedAsync(new QuickerRpcHostSelection
                {
                    HostSessionId = _selection?.HostSessionId ?? Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION"),
                    CandidateEndpoints = _selection?.CandidateEndpoints,
                    RequiredCapabilities = requiredCapabilities ?? _selection?.RequiredCapabilities ?? Array.Empty<string>(),
                }, _connectTimeoutSeconds, _tryBootstrap, cancellationToken: cancellationToken).ConfigureAwait(false);
            _binding ??= _session.Binding;
            _legacySelected = _binding is null;
            return _session;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task InvalidateDisconnectedAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_session is not null && _session.JsonRpc.Completion.IsCompleted)
            {
                await _session.DisposeAsync().ConfigureAwait(false);
                _session = null;
            }
        }
        finally { _gate.Release(); }
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

            // Binding survives invalidation: retries must reconnect only to the same bootstrap owner.
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var pool in _boundPools.Values) await pool.DisposeAsync().ConfigureAwait(false);
        await InvalidateAsync().ConfigureAwait(false);
        _gate.Dispose();
    }
}
