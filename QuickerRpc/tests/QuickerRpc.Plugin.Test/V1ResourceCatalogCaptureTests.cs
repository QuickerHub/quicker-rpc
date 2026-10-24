using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Adapters;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Runtime;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class V1ResourceCatalogCaptureTests
{
    [TestMethod]
    public async Task Missing_native_contract_or_dispatcher_never_reads_a_catalog_or_constructs_a_hub()
    {
        var dispatcherReads = 0;
        using var absent = new V1ResourceCatalogCapture(() => null, () => { dispatcherReads++; return null; });
        await absent.StartAsync(default);
        Assert.IsFalse(absent.CanRead("action"));
        Assert.AreEqual("UNSUPPORTED_HOST", (await absent.CaptureAsync("action", default)).ErrorCode);
        Assert.AreEqual(0, dispatcherReads);
        var session = new NativeSession(); var binding = new NativeBinding(session);
        using var noUi = new V1ResourceCatalogCapture(() => binding, () => null);
        await noUi.StartAsync(default);
        Assert.IsFalse((await noUi.CaptureAsync("action", default)).Success);
        Assert.AreEqual(0, binding.SessionReads); Assert.AreEqual(0, session.Subscriptions);
        using var stopped = new CancellationTokenSource(); stopped.Cancel();
        var cancelled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => noUi.CaptureAsync("action", stopped.Token));
        Assert.AreEqual(stopped.Token, cancelled.CancellationToken);
        Assert.AreEqual(0, binding.SessionReads);
    }

    [TestMethod]
    public async Task Non_host_metadata_probe_does_not_load_the_host_assembly()
    {
        var before = AppDomain.CurrentDomain.GetAssemblies().Select(value => value.FullName).ToArray();
        Assert.IsNull(V1ResourceCatalogNativeBinding.TryCreate());
        CollectionAssert.AreEquivalent(before, AppDomain.CurrentDomain.GetAssemblies().Select(value => value.FullName).ToArray());
        await Task.CompletedTask;
    }

    [TestMethod]
    public Task Runtime_capture_returns_detached_raw_summaries_and_preserves_a_true_empty_catalog() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); native.Rows.Add(Row("a"));
        using var capture = Create(native, dispatcher); await capture.StartAsync(default);
        var snapshot = await capture.CaptureAsync("action", default);
        Assert.IsTrue(snapshot.Success, snapshot.ErrorMessage); Assert.IsTrue(capture.IsCurrent(snapshot));
        Assert.AreEqual(1, native.Reads); Assert.AreEqual(1, native.Subscriptions);
        native.Rows.Clear();
        Assert.AreEqual("a", snapshot.Entries.Single().Id); Assert.AreEqual("9223372036854775807", snapshot.Entries[0].EditVersion);
        Assert.AreEqual("fa:Light_Folder:#80112233", snapshot.Entries[0].Icon);
        var empty = await capture.CaptureAsync("global_subprogram", default);
        Assert.IsTrue(empty.Success, empty.ErrorMessage); Assert.AreEqual(0, empty.Entries.Count);
    });

    [TestMethod]
    public Task Loading_exit_and_replaced_context_are_failures_instead_of_empty_success() => Ui(async dispatcher =>
    {
        foreach (var native in new[] { new NativeSession { IsLoaded = false }, new NativeSession { IsExiting = true },
            new NativeSession { IsCurrentContext = false } })
        {
            using var capture = Create(native, dispatcher); await capture.StartAsync(default);
            var result = await capture.CaptureAsync("action", default);
            Assert.IsFalse(result.Success); Assert.AreEqual("ACCOUNT_CONTEXT_UNAVAILABLE", result.ErrorCode);
            Assert.AreEqual(0, native.Reads);
        }
        var exiting = new NativeSession(); using var active = Create(exiting, dispatcher); await active.StartAsync(default);
        Assert.IsTrue((await active.CaptureAsync("action", default)).Success);
        exiting.IsExiting = true; // Native logout can fail after setting this flag and leave the process alive.
        Assert.AreEqual("ACCOUNT_CONTEXT_UNAVAILABLE", (await active.CaptureAsync("action", default)).ErrorCode);
        Assert.AreEqual(1, exiting.Reads);
    });

    [TestMethod]
    public Task Busy_native_monitor_and_same_thread_reentry_never_block_the_UI_or_enumerate() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); using var capture = Create(native, dispatcher); await capture.StartAsync(default);
        using var entered = new ManualResetEventSlim(); using var release = new ManualResetEventSlim();
        var worker = new Thread(() => { lock (native.SyncRoot) { entered.Set(); release.Wait(); } }) { IsBackground = true };
        worker.Start(); Assert.IsTrue(entered.Wait(TimeSpan.FromSeconds(3)));
        try
        {
            var started = DateTime.UtcNow;
            var busy = await capture.CaptureAsync("action", default);
            Assert.AreEqual("CATALOG_BUSY", busy.ErrorCode); Assert.IsTrue(DateTime.UtcNow - started < TimeSpan.FromSeconds(1));
            Assert.AreEqual(0, native.Reads);
        }
        finally { release.Set(); Assert.IsTrue(worker.Join(TimeSpan.FromSeconds(3))); }
        lock (native.SyncRoot)
        {
            var reentrant = capture.CaptureAsync("action", default).GetAwaiter().GetResult();
            Assert.AreEqual("CATALOG_BUSY", reentrant.ErrorCode); Assert.AreEqual(0, native.Reads);
        }
        Assert.IsTrue((await capture.CaptureAsync("action", default)).Success);
    });

    [TestMethod]
    public Task Sync_revision_invalidates_identical_A_B_A_pages_without_claiming_an_account_epoch() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); native.Rows.Add(Row("a")); native.Rows.Add(Row("b"));
        using var capture = Create(native, dispatcher); await capture.StartAsync(default);
        var pageHost = new V1ResourceCatalogPageHost(capture, new QuickerRpcHostSessionScope());
        var first = await pageHost.GetResourceCatalogPageAsync("action", new() { Take = 1 });
        Assert.IsTrue(first.Success, first.ErrorMessage); Assert.IsTrue(first.HasMore);
        native.Account = "b"; native.RaiseSync(); native.Account = "a"; native.RaiseSync();
        var later = await pageHost.GetResourceCatalogPageAsync("action", new() { Skip = 1, Take = 1, ExpectedSnapshotId = first.SnapshotId });
        Assert.IsFalse(later.Success); Assert.AreEqual("CATALOG_CHANGED", later.ErrorCode); Assert.AreEqual(0, later.Items.Count);
        var refreshed = await pageHost.GetResourceCatalogPageAsync("action", new());
        Assert.IsTrue(refreshed.Success); Assert.AreNotEqual(first.SnapshotId, refreshed.SnapshotId);
    });

    [TestMethod]
    public Task Stop_unsubscribes_once_and_restart_uses_a_new_owner_while_old_deliveries_stay_inert() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); using var capture = Create(native, dispatcher); await capture.StartAsync(default);
        var original = await capture.CaptureAsync("action", default); var late = native.Listeners.Single();
        await capture.StopAsync(default); await capture.StopAsync(default);
        Assert.AreEqual(1, native.Unsubscriptions); Assert.AreEqual(0, native.Listeners.Count); Assert.IsFalse(capture.IsCurrent(original));
        late(); // A native publisher may already have copied the subscription before Stop.
        Assert.IsFalse(capture.CanRead("action"));
        await capture.StartAsync(default);
        var fresh = await capture.CaptureAsync("action", default);
        Assert.IsTrue(fresh.Success); Assert.AreNotEqual(original.OwnerId, fresh.OwnerId); Assert.AreEqual(0L, fresh.Revision);
        late(); Assert.IsTrue(capture.IsCurrent(fresh));
        capture.Dispose(); Assert.AreEqual(2, native.Unsubscriptions); Assert.AreEqual(0, native.Listeners.Count);
    });

    [TestMethod]
    public Task Queued_capture_cannot_cross_Stop_Start_and_queued_cancellation_preserves_its_token() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); using var queued = new ManualResetEventSlim();
        using var capture = new V1ResourceCatalogCapture(() => new NativeBinding(native), () => { queued.Set(); return dispatcher; });
        await capture.StartAsync(default);
        var old = Task.Run(() => capture.CaptureAsync("action", default));
        Assert.IsTrue(queued.Wait(TimeSpan.FromSeconds(3)));
        await capture.StopAsync(default); await capture.StartAsync(default);
        Assert.AreEqual("CATALOG_CHANGED", (await old).ErrorCode); Assert.AreEqual(0, native.Reads);
        queued.Reset(); using var stop = new CancellationTokenSource();
        var cancelled = Task.Run(() => capture.CaptureAsync("action", stop.Token));
        Assert.IsTrue(queued.Wait(TimeSpan.FromSeconds(3))); stop.Cancel();
        var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => cancelled);
        Assert.AreEqual(stop.Token, error.CancellationToken); Assert.AreEqual(0, native.Reads);
        Assert.IsTrue((await capture.CaptureAsync("action", default)).Success);
    });

    [TestMethod]
    public Task Restart_after_account_invalidation_unsubscribes_the_old_owner_even_without_an_intervening_Stop() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); using var capture = Create(native, dispatcher); await capture.StartAsync(default);
        var first = await capture.CaptureAsync("action", default); var late = native.Listeners.Single();
        native.Account = "b";
        Assert.AreEqual("ACCOUNT_CONTEXT_CHANGED", (await capture.CaptureAsync("action", default)).ErrorCode);
        Assert.IsFalse(capture.CanRead("action"));
        await capture.StartAsync(default); Assert.AreEqual(1, native.Unsubscriptions);
        var next = await capture.CaptureAsync("action", default); Assert.IsTrue(next.Success, next.ErrorMessage);
        Assert.AreNotEqual(first.OwnerId, next.OwnerId); Assert.AreNotEqual(first.AccountScope, next.AccountScope);
        late(); Assert.IsTrue(capture.IsCurrent(next)); Assert.AreEqual(1, native.Listeners.Count);
    });

    [TestMethod]
    public Task Partial_enumeration_cancel_account_change_and_sync_during_copy_publish_no_partial_page() => Ui(async dispatcher =>
    {
        foreach (var mode in new[] { "throw", "cancel", "account", "sync", "exit", "context" })
        {
            var native = new NativeSession(); native.Rows.Add(Row("a")); native.Rows.Add(Row("b"));
            using var stop = new CancellationTokenSource();
            native.OnRow = index => { if (index != 1) return; if (mode == "throw") throw new InvalidOperationException("fixture native fault");
                if (mode == "cancel") stop.Cancel(); if (mode == "account") native.Account = "other"; if (mode == "sync") native.RaiseSync();
                if (mode == "exit") native.IsExiting = true; if (mode == "context") native.IsCurrentContext = false; };
            using var capture = Create(native, dispatcher); await capture.StartAsync(default);
            if (mode == "cancel")
            {
                var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => capture.CaptureAsync("action", stop.Token));
                Assert.AreEqual(stop.Token, error.CancellationToken);
            }
            else
            {
                var result = await capture.CaptureAsync("action", default);
                Assert.IsFalse(result.Success, mode); Assert.AreEqual(0, result.Entries.Count);
                Assert.AreEqual(mode == "throw" ? "CATALOG_CAPTURE_FAILED" : mode == "account" ? "ACCOUNT_CONTEXT_CHANGED"
                    : mode is "exit" or "context" ? "ACCOUNT_CONTEXT_UNAVAILABLE" : "CATALOG_CHANGED", result.ErrorCode);
            }
            Assert.AreEqual(1, native.EnumerationDisposals);
            Assert.IsFalse(Monitor.IsEntered(native.SyncRoot));
        }
    });

    [TestMethod]
    public Task Invalid_later_window_does_not_resolve_native_state_and_true_empty_has_a_snapshot() => Ui(async dispatcher =>
    {
        var native = new NativeSession(); var binding = new NativeBinding(native);
        using var capture = new V1ResourceCatalogCapture(() => binding, () => dispatcher); await capture.StartAsync(default);
        var host = new V1ResourceCatalogPageHost(capture, new QuickerRpcHostSessionScope());
        var missing = await host.GetResourceCatalogPageAsync("action", new() { Skip = 1 });
        Assert.AreEqual("SNAPSHOT_REQUIRED", missing.ErrorCode); Assert.AreEqual(0, binding.SessionReads);
        var empty = await host.GetResourceCatalogPageAsync("global_subprogram", new());
        Assert.IsTrue(empty.Success, empty.ErrorMessage); Assert.IsNotNull(empty.SnapshotId); Assert.AreEqual(0, empty.TotalCount); Assert.IsFalse(empty.HasMore);
    });

    [TestMethod]
    public Task Production_resource_DI_and_root_handshake_follow_Start_Stop_restart_with_one_shared_session_scope() => Ui(async dispatcher =>
    {
        var assemblies = AppDomain.CurrentDomain.GetAssemblies().Select(value => value.FullName).ToArray();
        var native = new NativeSession(); native.Rows.Add(Row("a")); native.Rows.Add(Row("b"));
        using var queued = new ManualResetEventSlim();
        using var capture = new V1ResourceCatalogCapture(() => new NativeBinding(native), () => { queued.Set(); return dispatcher; });
        using var host = new HostBuilder().ConfigureServices((_, services) =>
        {
            // Use the same registration as Launcher; only the native accessor and irrelevant ports are fixtures.
            services.AddV1ResourceCatalog(); services.AddSingleton(capture);
            services.AddSingleton<QuickerRpcHostSessionScope>();
            services.AddSingleton(sp => Root(sp.GetRequiredService<V1ResourceCatalogPageHost>()));
            services.AddSingleton<IQuickerRpcHost>(sp => sp.GetRequiredService<V1QuickerRpcHost>());
            services.AddSingleton(sp => new QuickerRpcService(sp.GetRequiredService<IQuickerRpcHost>(), null!, null!, null!, null!,
                sp.GetRequiredService<QuickerRpcHostSessionScope>()));
        }).Build();
        var runtime = host.Services.GetRequiredService<QuickerRpcService>();
        var port = host.Services.GetRequiredService<V1ResourceCatalogPageHost>();
        Assert.AreSame(capture, host.Services.GetServices<IHostedService>().Single());
        var before = await runtime.GetHostSessionAsync();
        Assert.IsFalse(before.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsFalse(before.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        await host.StartAsync();
        var started = await runtime.GetHostSessionAsync();
        Assert.AreEqual(before.HostSessionId, started.HostSessionId);
        Assert.IsTrue(started.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsTrue(started.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        Assert.AreEqual(0, native.Reads); // Handshakes never read account state or catalogs.
        var first = await runtime.GetActionResourceCatalogPageAsync(new() { Take = 1 });
        Assert.IsTrue(first.Success, first.ErrorMessage);
        Assert.AreEqual(first.SnapshotId, (await port.GetResourceCatalogPageAsync("action", new() { Take = 2 })).SnapshotId);
        var oldCallback = native.Listeners.Single(); var reads = native.Reads;
        queued.Reset();
        var pending = Task.Run(() => runtime.GetActionResourceCatalogPageAsync(new()));
        Assert.IsTrue(queued.Wait(TimeSpan.FromSeconds(3)));
        await host.StopAsync();
        Assert.IsFalse((await runtime.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        // Generic Host's lifetime is terminal after Stop. Reuse the registered component via its actual hosted hooks.
        await host.Services.GetServices<IHostedService>().Single().StartAsync(default);
        Assert.AreEqual("CATALOG_CHANGED", (await pending).ErrorCode); Assert.AreEqual(reads, native.Reads);
        Assert.AreEqual(1, native.Unsubscriptions);
        var stale = await runtime.GetActionResourceCatalogPageAsync(new() { Skip = 1, ExpectedSnapshotId = first.SnapshotId });
        Assert.AreEqual("CATALOG_CHANGED", stale.ErrorCode);
        var fresh = await runtime.GetActionResourceCatalogPageAsync(new());
        Assert.IsTrue(fresh.Success, fresh.ErrorMessage); Assert.AreNotEqual(first.SnapshotId, fresh.SnapshotId);
        oldCallback();
        Assert.AreEqual(fresh.SnapshotId, (await runtime.GetActionResourceCatalogPageAsync(new())).SnapshotId);
        Assert.AreEqual(started.HostSessionId, (await runtime.GetHostSessionAsync()).HostSessionId);
        await host.Services.GetServices<IHostedService>().Single().StopAsync(default); Assert.AreEqual(2, native.Unsubscriptions);
        Assert.AreEqual(assemblies.Count(value => value.StartsWith("Quicker,", StringComparison.Ordinal)),
            AppDomain.CurrentDomain.GetAssemblies().Count(value => value.GetName().Name == "Quicker"),
            "Composing the host must not load Quicker or construct native services.");
    });

    [TestMethod]
    public async Task Manual_root_without_catalog_composition_keeps_both_capabilities_false_and_refuses_reads()
    {
        var root = Root(null); var runtime = new QuickerRpcService(root, null!, null!, null!, null!);
        var session = await runtime.GetHostSessionAsync();
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        Assert.AreEqual("UNSUPPORTED_HOST", (await runtime.GetActionResourceCatalogPageAsync(new())).ErrorCode);
        Assert.AreEqual("UNSUPPORTED_HOST", (await runtime.GetGlobalSubProgramResourceCatalogPageAsync(new())).ErrorCode);
    }

    private static V1QuickerRpcHost Root(V1ResourceCatalogPageHost? port) => new(
        session: null!, actionPrograms: null!, actionSharing: null!, subPrograms: null!, actionRuns: null!, actionCatalog: null!,
        search: null!, settings: null!, actionDocs: null!, stepRunners: null!, expressions: null!, chromeControl: null!, triggers: null!,
        designer: null!, launcher: null!, resourceCatalog: port);

    private static V1ResourceCatalogCapture Create(NativeSession session, Dispatcher dispatcher) =>
        new(() => new NativeBinding(session), () => dispatcher);
    private static ResourceCatalogEntry Row(string id) => new(id, id, "stored", "fa:Light_Folder:#80112233", "9223372036854775807", "XAction");

    private static async Task Ui(Func<Dispatcher, Task> run)
    {
        var complete = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            var dispatcher = Dispatcher.CurrentDispatcher;
            SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(dispatcher));
            dispatcher.BeginInvoke(new Action(async () =>
            {
                try { await run(dispatcher); complete.TrySetResult(true); }
                catch (Exception exception) { complete.TrySetException(exception); }
                finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Send); }
            }));
            Dispatcher.Run();
        }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
        try { await complete.Task; }
        finally { Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5)), "The owned WPF fixture thread did not exit."); }
    }

    private sealed class NativeBinding : IV1ResourceCatalogNativeBinding
    {
        private readonly NativeSession _session;
        public NativeBinding(NativeSession session) => _session = session;
        public int SessionReads;
        public bool TryGetSession(out IV1ResourceCatalogNativeSession? session, out string? code, out string? error)
        { SessionReads++; session = _session; code = null; error = null; return true; }
    }
    private sealed class NativeSession : IV1ResourceCatalogNativeSession
    {
        public object SyncRoot { get; } = new();
        public bool IsLoaded { get; set; } = true;
        public bool IsExiting { get; set; }
        public bool IsCurrentContext { get; set; } = true;
        public string Account = "a";
        public int Reads, Subscriptions, Unsubscriptions, EnumerationDisposals;
        public readonly List<ResourceCatalogEntry> Rows = new();
        public readonly List<Action> Listeners = new();
        public Action<int>? OnRow;
        public string? ReadAccountId() => Account;
        public IDisposable SubscribeSync(Action changed)
        { Subscriptions++; Listeners.Add(changed); return new Release(() => { Unsubscriptions++; Listeners.Remove(changed); }); }
        public void RaiseSync() { foreach (var callback in Listeners.ToArray()) callback(); }
        public IEnumerable<ResourceCatalogEntry> ReadEntries(string kind)
        {
            Reads++;
            try { for (var i = 0; i < Rows.Count; i++) { OnRow?.Invoke(i); yield return Rows[i]; } }
            finally { EnumerationDisposals++; }
        }
    }
    private sealed class Release : IDisposable
    {
        private Action? _release;
        public Release(Action release) => _release = release;
        public void Dispose() => Interlocked.Exchange(ref _release, null)?.Invoke();
    }
}
