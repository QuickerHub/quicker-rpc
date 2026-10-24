using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.Hosting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

internal interface IV1ResourceCatalogNativeBinding
{
    bool TryGetSession(out IV1ResourceCatalogNativeSession? session, out string? code, out string? error);
}

internal interface IV1ResourceCatalogNativeSession
{
    object SyncRoot { get; }
    bool IsLoaded { get; }
    bool IsExiting { get; }
    bool IsCurrentContext { get; }
    string? ReadAccountId();
    IDisposable SubscribeSync(Action changed);
    IEnumerable<ResourceCatalogEntry> ReadEntries(string kind);
}

/// <summary>Detached scalar projection; no native entity or native service escapes in a snapshot.</summary>
internal sealed class V1ResourceCatalogSnapshot
{
    public bool Success { get; }
    public string? ErrorCode { get; }
    public string? ErrorMessage { get; }
    public string OwnerId { get; }
    public string AccountScope { get; }
    public long Revision { get; }
    public IReadOnlyList<ResourceCatalogEntry> Entries { get; }
    private V1ResourceCatalogSnapshot(bool success, string? code, string? message, string ownerId, string accountScope,
        long revision, IReadOnlyList<ResourceCatalogEntry> entries)
    { Success = success; ErrorCode = code; ErrorMessage = message; OwnerId = ownerId; AccountScope = accountScope; Revision = revision; Entries = entries; }
    public static V1ResourceCatalogSnapshot Fail(string code, string message) =>
        new(false, code, message, string.Empty, string.Empty, 0, Array.Empty<ResourceCatalogEntry>());
    public static V1ResourceCatalogSnapshot Captured(string ownerId, string accountScope, long revision,
        IReadOnlyList<ResourceCatalogEntry> entries) => new(true, null, null, ownerId, accountScope, revision, entries);
}

/// <summary>Owns native read observation for one running plugin host, including reusable-host Stop/Start.</summary>
internal sealed class V1ResourceCatalogCapture : IHostedService, IDisposable
{
    private readonly object _gate = new();
    private readonly Func<IV1ResourceCatalogNativeBinding?> _createBinding;
    private readonly Func<Dispatcher?> _dispatcher;
    private Owner? _owner;
    private bool _disposed;

    public V1ResourceCatalogCapture() : this(V1ResourceCatalogNativeBinding.TryCreate, () => Application.Current?.Dispatcher) { }
    internal V1ResourceCatalogCapture(Func<IV1ResourceCatalogNativeBinding?> createBinding, Func<Dispatcher?> dispatcher)
    { _createBinding = createBinding; _dispatcher = dispatcher; }

    public bool CanRead(string kind)
    {
        var owner = Volatile.Read(ref _owner);
        return (kind == "action" || kind == "global_subprogram") && owner is { Binding: not null } && owner.IsActive;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            if (_disposed) throw new ObjectDisposedException(nameof(V1ResourceCatalogCapture));
            if (_owner?.IsActive == true) return Task.CompletedTask;
            // This factory reads only already-loaded module/member metadata, never account state or stores.
            _owner = new Owner(_createBinding());
        }
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        Owner? owner;
        lock (_gate)
        {
            owner = _owner;
            owner?.Invalidate();
            _owner = null;
        }
        owner?.Unsubscribe();
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        lock (_gate) { if (_disposed) return; _disposed = true; }
        StopAsync(CancellationToken.None).GetAwaiter().GetResult();
    }

    public bool IsCurrent(V1ResourceCatalogSnapshot snapshot)
    {
        var owner = Volatile.Read(ref _owner);
        return snapshot.Success && owner is not null && owner.IsActive
            && string.Equals(owner.Id, snapshot.OwnerId, StringComparison.Ordinal) && owner.Revision == snapshot.Revision;
    }

    public async Task<V1ResourceCatalogSnapshot> CaptureAsync(string kind, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var owner = Volatile.Read(ref _owner);
        if (owner is null || !owner.IsActive) return Changed();
        if (owner.Binding is null || (kind != "action" && kind != "global_subprogram"))
            return V1ResourceCatalogSnapshot.Fail("UNSUPPORTED_HOST", "The selected host does not provide this native resource catalog.");
        var dispatcher = _dispatcher();
        if (dispatcher is null || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
            return V1ResourceCatalogSnapshot.Fail("ACCOUNT_CONTEXT_UNAVAILABLE", "A running native application dispatcher is required.");
        V1ResourceCatalogSnapshot result;
        try
        {
            if (dispatcher.CheckAccess()) result = CaptureOnUi(owner, dispatcher, kind, cancellationToken);
            else result = await dispatcher.InvokeAsync(() => CaptureOnUi(owner, dispatcher, kind, cancellationToken),
                DispatcherPriority.Normal, cancellationToken).Task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // WPF aborts queued operations with its own TaskCanceledException. Preserve the caller's cause.
            cancellationToken.ThrowIfCancellationRequested();
            throw;
        }
        cancellationToken.ThrowIfCancellationRequested();
        if (result.Success && !IsCurrent(result)) return Changed();
        return result;
    }

    private V1ResourceCatalogSnapshot CaptureOnUi(Owner owner, Dispatcher dispatcher, string kind, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (!Owns(owner)) return Changed();
        if (!dispatcher.CheckAccess() || dispatcher.HasShutdownStarted || dispatcher.HasShutdownFinished)
            return V1ResourceCatalogSnapshot.Fail("ACCOUNT_CONTEXT_UNAVAILABLE", "The native dispatcher is no longer available.");
        var acquired = false;
        object? syncRoot = null;
        try
        {
            var session = owner.GetSession(out var code, out var error);
            if (session is null) return V1ResourceCatalogSnapshot.Fail(code ?? "ACCOUNT_CONTEXT_UNAVAILABLE", error ?? "The native account is unavailable.");
            if (!Ready(session)) return ContextUnavailable();
            syncRoot = session.SyncRoot;
            // Sync may synchronously wait for UI. Never wait on its lock, including same-thread reentry.
            if (Monitor.IsEntered(syncRoot) || !Monitor.TryEnter(syncRoot))
                return V1ResourceCatalogSnapshot.Fail("CATALOG_BUSY", "The native catalog is being synchronized.");
            acquired = true;
            if (!Owns(owner)) return Changed();
            if (!Ready(session)) return ContextUnavailable();
            var accountId = session.ReadAccountId();
            if (string.IsNullOrWhiteSpace(accountId)) return ContextUnavailable();
            if (owner.AccountId is not null && !string.Equals(owner.AccountId, accountId, StringComparison.Ordinal))
            {
                owner.Invalidate();
                return V1ResourceCatalogSnapshot.Fail("ACCOUNT_CONTEXT_CHANGED", "The native account changed. Reconnect explicitly.");
            }
            var revision = owner.Revision;
            var entries = new List<ResourceCatalogEntry>();
            foreach (var row in session.ReadEntries(kind))
            {
                token.ThrowIfCancellationRequested();
                if (!Owns(owner)) return Changed();
                if (row is null) throw new InvalidOperationException("The native catalog contains an invalid summary.");
                entries.Add(new ResourceCatalogEntry(row.Id, row.Title, row.Description, row.Icon, row.EditVersion, row.ActionType, row.CallIdentifier));
            }
            token.ThrowIfCancellationRequested();
            if (!Owns(owner) || owner.Revision != revision) return Changed();
            if (!Ready(session)) return ContextUnavailable();
            if (!string.Equals(accountId, session.ReadAccountId(), StringComparison.Ordinal))
            {
                owner.Invalidate();
                return V1ResourceCatalogSnapshot.Fail("ACCOUNT_CONTEXT_CHANGED", "The native account changed during capture. Reconnect explicitly.");
            }
            owner.AccountId ??= accountId;
            return V1ResourceCatalogSnapshot.Captured(owner.Id, AccountScope(accountId), revision, entries.AsReadOnly());
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception exception)
        {
            var error = exception is System.Reflection.TargetInvocationException { InnerException: not null } invocation
                ? invocation.InnerException : exception;
            return V1ResourceCatalogSnapshot.Fail("CATALOG_CAPTURE_FAILED", error!.Message);
        }
        finally { if (acquired) Monitor.Exit(syncRoot!); }
    }

    private bool Owns(Owner owner) => owner.IsActive && ReferenceEquals(Volatile.Read(ref _owner), owner);
    private static bool Ready(IV1ResourceCatalogNativeSession session) => session.IsLoaded && !session.IsExiting && session.IsCurrentContext;
    private static V1ResourceCatalogSnapshot Changed() => V1ResourceCatalogSnapshot.Fail("CATALOG_CHANGED", "The catalog capture owner or revision changed. Read a new first page.");
    private static V1ResourceCatalogSnapshot ContextUnavailable() => V1ResourceCatalogSnapshot.Fail("ACCOUNT_CONTEXT_UNAVAILABLE", "The native account is loading, exiting, or no longer matches its store.");
    private static string AccountScope(string accountId)
    {
        using var hash = SHA256.Create();
        return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(accountId))).Replace("-", string.Empty).ToLowerInvariant();
    }

    private sealed class Owner
    {
        private readonly object _sessionGate = new();
        private long _state;
        private IV1ResourceCatalogNativeSession? _session;
        private IDisposable? _subscription;
        public Owner(IV1ResourceCatalogNativeBinding? binding) { Binding = binding; Id = Guid.NewGuid().ToString("N"); }
        public string Id { get; }
        public IV1ResourceCatalogNativeBinding? Binding { get; }
        public string? AccountId { get; set; }
        public bool IsActive => Interlocked.Read(ref _state) >= 0;
        public long Revision => Interlocked.Read(ref _state);
        public void Invalidate() => Interlocked.Exchange(ref _state, -1);
        private void Changed()
        {
            // A copied native delivery after Stop cannot reactivate or mutate the stopped owner.
            while (true)
            {
                var previous = Interlocked.Read(ref _state);
                if (previous < 0) return;
                var next = previous == long.MaxValue ? -1 : previous + 1;
                if (Interlocked.CompareExchange(ref _state, next, previous) == previous) return;
            }
        }
        public IV1ResourceCatalogNativeSession? GetSession(out string? code, out string? error)
        {
            code = null; error = null;
            lock (_sessionGate)
            {
                if (!IsActive) { code = "CATALOG_CHANGED"; error = "The capture owner stopped."; return null; }
                if (_session is not null) return _session;
                if (Binding is null || !Binding.TryGetSession(out var session, out code, out error) || session is null) return null;
                var subscription = session.SubscribeSync(Changed);
                if (!IsActive) { subscription.Dispose(); code = "CATALOG_CHANGED"; error = "The capture owner stopped."; return null; }
                _subscription = subscription;
                _session = session;
                return session;
            }
        }
        public void Unsubscribe()
        {
            IDisposable? subscription;
            lock (_sessionGate) { subscription = _subscription; _subscription = null; _session = null; }
            subscription?.Dispose();
        }
    }
}
