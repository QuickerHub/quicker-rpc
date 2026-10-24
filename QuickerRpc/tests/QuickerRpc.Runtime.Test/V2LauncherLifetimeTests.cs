using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class V2LauncherLifetimeTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);
    private static TaskCompletionSource Gate() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task Stop_during_startup_delay_releases_partial_manual_or_external_owner(bool external)
    {
        var fixture = new Fixture(external);
        var lifetime = new V2LauncherLifetime(fixture.CreateOwner, fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var starting));
        await fixture.Entered.Task.WaitAsync(Timeout);

        await lifetime.StopAsync().WaitAsync(Timeout);
        await starting.WaitAsync(Timeout);

        Assert.AreEqual(LauncherStatus.Stopped, lifetime.Status);
        Assert.AreEqual(0, fixture.ServersCreated);
        Assert.AreEqual(external ? 1 : 0, fixture.HostStops);
        Assert.AreEqual(external ? 1 : 0, fixture.ResourceDisposes);
        Assert.AreEqual(0, fixture.StartedCallbacks);
        Assert.IsFalse(lifetime.TryStart(out _), "Stopped remains terminal.");
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task Late_start_ignoring_cancellation_is_cleaned_before_all_Stop_callers_complete(bool external)
    {
        var fixture = new Fixture(external) { IgnoreCancellation = true, HoldCleanup = true };
        var lifetime = new V2LauncherLifetime(fixture.CreateOwner, fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var starting));
        await fixture.Entered.Task.WaitAsync(Timeout);
        var stopping = lifetime.StopAsync();
        var secondStop = lifetime.StopAsync();
        Assert.AreSame(stopping, secondStop);
        Assert.IsFalse(stopping.IsCompleted);

        fixture.AllowStart.SetResult();
        await fixture.CleanupEntered.Task.WaitAsync(Timeout);
        Assert.IsFalse(stopping.IsCompleted, "Stop must await cleanup of the late owner.");
        fixture.AllowCleanup.SetResult();
        await Task.WhenAll(starting, stopping, secondStop).WaitAsync(Timeout);
        await lifetime.StopAsync().WaitAsync(Timeout);

        Assert.AreEqual(LauncherStatus.Stopped, lifetime.Status);
        Assert.IsFalse(fixture.ServerRunning);
        Assert.AreEqual(1, fixture.ServerStops);
        Assert.AreEqual(external ? 1 : 0, fixture.HostStops);
        Assert.AreEqual(1, fixture.ResourceDisposes);
        Assert.AreEqual(0, fixture.StartedCallbacks);
    }

    [TestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task Published_manual_or_external_owner_is_released_once_by_concurrent_Stop(bool external)
    {
        var fixture = new Fixture(external) { HoldCleanup = true };
        var lifetime = new V2LauncherLifetime(fixture.CreateOwner, fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var starting));
        fixture.AllowStart.SetResult();
        await starting.WaitAsync(Timeout);
        Assert.AreEqual(LauncherStatus.Started, lifetime.Status);
        Assert.IsFalse(lifetime.TryStart(out _));

        var stopping = lifetime.StopAsync();
        await fixture.CleanupEntered.Task.WaitAsync(Timeout);
        var others = new Task[20];
        Parallel.For(0, others.Length, index => others[index] = lifetime.StopAsync());
        Assert.IsTrue(others.All(task => !task.IsCompleted));
        fixture.AllowCleanup.SetResult();
        await Task.WhenAll(others.Append(stopping)).WaitAsync(Timeout);

        Assert.AreEqual(LauncherStatus.Stopped, lifetime.Status);
        Assert.IsFalse(fixture.ServerRunning);
        Assert.AreEqual(1, fixture.ServerStops);
        Assert.AreEqual(external ? 1 : 0, fixture.HostStops);
        Assert.AreEqual(1, fixture.ResourceDisposes);
        Assert.AreEqual(1, fixture.StartedCallbacks);
    }

    [TestMethod]
    public async Task Failed_start_releases_its_owner_before_retry_and_cannot_release_the_next_owner()
    {
        var failed = new Fixture(true) { StartFailure = true, HoldCleanup = true };
        var next = new Fixture(false);
        var factories = new Queue<Fixture>([failed, next]);
        var lifetime = new V2LauncherLifetime(() => factories.Dequeue().CreateOwner(), () => { });
        Assert.IsTrue(lifetime.TryStart(out var first));
        failed.AllowStart.SetResult();
        await failed.CleanupEntered.Task.WaitAsync(Timeout);
        Assert.AreEqual(LauncherStatus.Starting, lifetime.Status);
        Assert.IsFalse(lifetime.TryStart(out _), "A partially owned failure must finish cleanup first.");
        failed.AllowCleanup.SetResult();
        await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => first.WaitAsync(Timeout));
        Assert.AreEqual(LauncherStatus.NotStarted, lifetime.Status);
        Assert.AreEqual(1, failed.ServerStops);
        Assert.AreEqual(1, failed.HostStops);
        Assert.AreEqual(1, failed.ResourceDisposes);

        Assert.IsTrue(lifetime.TryStart(out var retry));
        next.AllowStart.SetResult();
        await retry.WaitAsync(Timeout);
        Assert.AreEqual(LauncherStatus.Started, lifetime.Status);
        Assert.IsTrue(next.ServerRunning);
        Assert.AreEqual(0, next.ServerStops);
        await lifetime.StopAsync().WaitAsync(Timeout);
        Assert.AreEqual(1, next.ServerStops);
        Assert.AreEqual(1, next.ResourceDisposes);
        Assert.AreEqual(1, failed.ResourceDisposes);
    }

    [TestMethod]
    public async Task Owner_factory_failure_can_retry_without_publishing_any_owner()
    {
        var calls = 0;
        var fixture = new Fixture(false);
        var lifetime = new V2LauncherLifetime(
            () => ++calls == 1 ? throw new InvalidOperationException("factory fixture") : fixture.CreateOwner(),
            fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var failed));
        await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => failed.WaitAsync(Timeout));
        Assert.AreEqual(LauncherStatus.NotStarted, lifetime.Status);
        Assert.IsTrue(lifetime.TryStart(out var retry));
        fixture.AllowStart.SetResult();
        await retry.WaitAsync(Timeout);
        await lifetime.StopAsync().WaitAsync(Timeout);
        Assert.AreEqual(1, fixture.ServerStops);
        Assert.AreEqual(1, fixture.ResourceDisposes);
    }

    [TestMethod]
    public async Task Failure_finishing_after_Stop_cannot_reopen_the_lifetime_or_publish_its_owner()
    {
        var fixture = new Fixture(true) { IgnoreCancellation = true, StartFailure = true };
        var lifetime = new V2LauncherLifetime(fixture.CreateOwner, fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var starting));
        await fixture.Entered.Task.WaitAsync(Timeout);
        var stopping = lifetime.StopAsync();
        fixture.AllowStart.SetResult();
        await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => starting.WaitAsync(Timeout));
        await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => stopping.WaitAsync(Timeout));
        Assert.AreEqual(LauncherStatus.Stopped, lifetime.Status);
        Assert.IsFalse(lifetime.TryStart(out _));
        Assert.IsFalse(fixture.ServerRunning);
        Assert.AreEqual(1, fixture.ServerStops);
        Assert.AreEqual(1, fixture.HostStops);
        Assert.AreEqual(1, fixture.ResourceDisposes);
        Assert.AreEqual(0, fixture.StartedCallbacks);
    }

    [TestMethod]
    public async Task Stop_failure_still_disposes_owner_and_all_callers_observe_same_failure()
    {
        var fixture = new Fixture(true) { StopFailure = true };
        var lifetime = new V2LauncherLifetime(fixture.CreateOwner, fixture.OnStarted);
        Assert.IsTrue(lifetime.TryStart(out var starting));
        fixture.AllowStart.SetResult();
        await starting.WaitAsync(Timeout);
        var stopping = lifetime.StopAsync();
        await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => stopping.WaitAsync(Timeout));
        Assert.AreSame(stopping, lifetime.StopAsync());
        Assert.AreEqual(1, fixture.HostStops);
        Assert.AreEqual(1, fixture.ResourceDisposes);
        Assert.AreEqual(LauncherStatus.Stopped, lifetime.Status);
    }

    [TestMethod]
    public async Task Startup_owner_release_is_idempotent_even_when_Stop_and_failure_cleanup_share_it()
    {
        var stops = 0;
        var disposes = 0;
        var allowStop = Gate();
        var owner = new LauncherStartupOwner(_ => Task.CompletedTask,
            async () => { Interlocked.Increment(ref stops); await allowStop.Task; },
            () => Interlocked.Increment(ref disposes));
        var first = owner.ReleaseAsync();
        var second = owner.ReleaseAsync();
        Assert.AreSame(first, second);
        allowStop.SetResult();
        await Task.WhenAll(first, second).WaitAsync(Timeout);
        Assert.AreEqual(1, stops);
        Assert.AreEqual(1, disposes);
    }

    private sealed class Fixture(bool external)
    {
        public readonly TaskCompletionSource Entered = Gate();
        public readonly TaskCompletionSource AllowStart = Gate();
        public readonly TaskCompletionSource CleanupEntered = Gate();
        public readonly TaskCompletionSource AllowCleanup = Gate();
        public bool IgnoreCancellation, HoldCleanup, StartFailure, StopFailure, ServerRunning;
        public int ServersCreated, ServerStops, HostStops, ResourceDisposes, StartedCallbacks;
        private bool _resourceCreated;

        public void OnStarted() => StartedCallbacks++;

        public LauncherStartupOwner CreateOwner() => new(
            async token =>
            {
                // The external host exists before the delay; the manual logger is allocated after it.
                if (external) _resourceCreated = true;
                Entered.SetResult();
                if (IgnoreCancellation) await AllowStart.Task;
                else await AllowStart.Task.WaitAsync(token);
                _resourceCreated = true;
                ServersCreated++;
                ServerRunning = true;
                if (StartFailure) throw new InvalidOperationException("start fixture");
            },
            async () =>
            {
                CleanupEntered.SetResult();
                if (HoldCleanup) await AllowCleanup.Task;
                try
                {
                    if (ServersCreated > 0) { ServerStops++; ServerRunning = false; }
                    if (StopFailure) throw new InvalidOperationException("stop fixture");
                }
                finally { if (external && _resourceCreated) HostStops++; }
            },
            () => { if (_resourceCreated) ResourceDisposes++; });
    }
}
