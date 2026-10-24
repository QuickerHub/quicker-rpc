namespace QuickerRpc.Plugin;

/// <summary>Owns one startup attempt and transfers its resources atomically to Stop.</summary>
internal sealed class V2LauncherLifetime(Func<LauncherStartupOwner> createOwner, Action onStarted)
{
    private readonly object _gate = new();
    private LauncherStatus _status;
    private StartupAttempt? _attempt;
    private LauncherStartupOwner? _owner;
    private Task? _stopTask;

    public LauncherStatus Status
    {
        get { lock (_gate) return _status; }
    }

    public bool TryStart(out Task startup)
    {
        lock (_gate)
        {
            if (_status != LauncherStatus.NotStarted)
            {
                startup = _attempt?.Task ?? Task.CompletedTask;
                return false;
            }

            var attempt = new StartupAttempt();
            _attempt = attempt;
            _status = LauncherStatus.Starting;
            // Publish the task before Stop can capture this attempt.
            startup = attempt.Task = Task.Run(() => StartAsync(attempt));
            return true;
        }
    }

    public Task StopAsync()
    {
        StartupAttempt? attempt;
        LauncherStartupOwner? owner;
        TaskCompletionSource completion;
        lock (_gate)
        {
            if (_stopTask is not null) return _stopTask;
            _status = LauncherStatus.Stopped;
            attempt = _attempt;
            owner = _owner;
            _owner = null;
            completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
            _stopTask = completion.Task;
        }

        // Cancellation and cleanup may invoke callbacks; keep both outside the state lock.
        _ = CompleteStopAsync(attempt, owner, completion);
        return completion.Task;
    }

    private async Task StartAsync(StartupAttempt attempt)
    {
        LauncherStartupOwner? owner = null;
        try
        {
            owner = createOwner();
            await owner.StartAsync(attempt.Cancellation.Token).ConfigureAwait(false);
            lock (_gate)
            {
                if (ReferenceEquals(_attempt, attempt) && _status == LauncherStatus.Starting)
                {
                    _owner = owner;
                    owner = null;
                    _status = LauncherStatus.Started;
                    _attempt = null;
                    onStarted();
                }
            }
        }
        catch (OperationCanceledException) when (attempt.Cancellation.IsCancellationRequested)
        {
            // Stop owns the cancellation, while this attempt still owns any unpublished resources.
        }
        finally
        {
            try
            {
                if (owner is not null) await owner.ReleaseAsync().ConfigureAwait(false);
            }
            finally
            {
                lock (_gate)
                {
                    if (ReferenceEquals(_attempt, attempt))
                    {
                        _attempt = null;
                        if (_status == LauncherStatus.Starting) _status = LauncherStatus.NotStarted;
                    }
                }
                attempt.Cancellation.Dispose();
            }
        }
    }

    private static async Task CompleteStopAsync(
        StartupAttempt? attempt, LauncherStartupOwner? owner, TaskCompletionSource completion)
    {
        try
        {
            if (attempt is not null)
            {
                try
                {
                    try { await attempt.Cancellation.CancelAsync().ConfigureAwait(false); }
                    catch (ObjectDisposedException) { /* Startup already completed. */ }
                }
                finally { await attempt.Task.ConfigureAwait(false); }
            }
            if (owner is not null) await owner.ReleaseAsync().ConfigureAwait(false);
            completion.SetResult();
        }
        catch (Exception error)
        {
            completion.SetException(error);
        }
    }

    private sealed class StartupAttempt
    {
        public CancellationTokenSource Cancellation { get; } = new();
        public Task Task { get; set; } = Task.CompletedTask;
    }
}

/// <summary>Retains partial startup resources until their single cleanup completes.</summary>
internal sealed class LauncherStartupOwner
{
    private readonly object _gate = new();
    private readonly Func<CancellationToken, Task> _start;
    private readonly Func<Task> _stop;
    private readonly Action _dispose;
    private Task? _releaseTask;

    public LauncherStartupOwner(Func<CancellationToken, Task> start, Func<Task> stop, Action dispose)
    {
        _start = start;
        _stop = stop;
        _dispose = dispose;
    }

    public Task StartAsync(CancellationToken cancellationToken) => _start(cancellationToken);
    public Task ReleaseAsync()
    {
        TaskCompletionSource completion;
        lock (_gate)
        {
            if (_releaseTask is not null) return _releaseTask;
            completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
            _releaseTask = completion.Task;
        }
        _ = ReleaseCoreAsync(completion);
        return completion.Task;
    }

    private async Task ReleaseCoreAsync(TaskCompletionSource completion)
    {
        try
        {
            try { await _stop().ConfigureAwait(false); }
            finally { _dispose(); }
            completion.SetResult();
        }
        catch (Exception error) { completion.SetException(error); }
    }
}

public enum LauncherStatus
{
    NotStarted,
    Starting,
    Started,
    Stopped,
}
