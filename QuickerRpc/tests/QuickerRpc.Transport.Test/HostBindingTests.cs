using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class HostBindingTests
{
    [TestMethod]
    public async Task Unique_candidate_autoselects_and_multiple_hosts_require_explicit_selection()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        var selection = new QuickerRpcHostSelection { CandidateEndpoints = new[] { a.Endpoint } };
        await using var single = await QuickerRpcClient.ConnectSelectedAsync(selection);
        Assert.AreEqual(a.SessionId, single.Binding!.HostSessionId);
        selection.CandidateEndpoints = new[] { a.Endpoint, b.Endpoint };
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => QuickerRpcClient.ConnectSelectedAsync(selection));
        Assert.AreEqual(QuickerRpcBindingErrors.Ambiguous, error.ErrorCode);
        selection.HostSessionId = b.SessionId;
        await using var selected = await QuickerRpcClient.ConnectSelectedAsync(selection);
        Assert.AreEqual("v2", selected.Binding!.HostKind);
        Assert.AreEqual(0, a.Writes + b.Writes);
    }

    [TestMethod]
    public async Task Capability_filter_is_explicit_and_snapshot_is_immutable()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2", source: false);
        var candidates = await QuickerRpcHostDiscovery.DiscoverAsync(new QuickerRpcHostSelection
        { CandidateEndpoints = new[] { a.Endpoint, b.Endpoint }, RequiredCapabilities = new[] { QuickerRpcHostCapabilityNames.ActionSourceWrite } });
        Assert.AreEqual(1, candidates.Count);
        a.Info.Capabilities[QuickerRpcHostCapabilityNames.ActionSourceWrite] = false;
        Assert.IsTrue(candidates[0].Supports(QuickerRpcHostCapabilityNames.ActionSourceWrite));
        await using var session = await QuickerRpcClient.ConnectBoundAsync(b.Binding);
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => session.Rpc.ApplyActionProgramSourceAsync("fake", "{}"));
        Assert.AreEqual(QuickerRpcBindingErrors.Unsupported, error.ErrorCode);
        Assert.AreEqual(0, b.Writes);
    }

    [TestMethod]
    public async Task Host_exit_does_not_redirect_bound_write_to_surviving_host()
    {
        var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        var binding = a.Binding;
        await a.DisposeAsync();
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => QuickerRpcClient.ConnectBoundAsync(binding, 1));
        Assert.AreEqual(QuickerRpcBindingErrors.Unavailable, error.ErrorCode);
        Assert.AreEqual(0, b.Handshakes);
        Assert.AreEqual(0, b.Writes);
    }

    [TestMethod]
    public async Task Endpoint_and_session_mismatch_are_rejected_before_any_write()
    {
        await using var a = new FakeBindingHost();
        var original = a.Binding;
        a.Info.HostSessionId = Guid.NewGuid().ToString("N");
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => QuickerRpcClient.ConnectBoundAsync(original));
        Assert.AreEqual(QuickerRpcBindingErrors.InvalidHandshake, error.ErrorCode);
        a.Info.Endpoint = QuickerRpcEndpointNames.ForSession(Guid.NewGuid().ToString("N"));
        error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => QuickerRpcClient.ConnectBoundAsync(original));
        Assert.AreEqual(QuickerRpcBindingErrors.InvalidHandshake, error.ErrorCode);
        Assert.AreEqual(0, a.Writes);
    }

    [TestMethod]
    public async Task Old_plugin_cannot_be_bound_and_write_disconnect_returns_unknown_without_retry()
    {
        await using var legacy = new FakeBindingHost(legacy: true);
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => QuickerRpcClient.ConnectBoundAsync(legacy.Binding));
        Assert.AreEqual(QuickerRpcBindingErrors.InvalidHandshake, error.ErrorCode);
        await using var current = new FakeBindingHost { DropAfterWrite = true };
        await using var session = await QuickerRpcClient.ConnectBoundAsync(current.Binding);
        error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => session.Rpc.ApplyActionProgramSourceAsync("fake", "{}"));
        Assert.AreEqual(QuickerRpcBindingErrors.UnknownWriteResult, error.ErrorCode);
        Assert.AreEqual(1, current.Writes);
    }

    [TestMethod]
    public async Task Parallel_bindings_cancel_independently()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        using var cancel = new CancellationTokenSource();
        cancel.Cancel();
        var canceled = QuickerRpcClient.ConnectBoundAsync(a.Binding, cancellationToken: cancel.Token);
        await using var survivor = await QuickerRpcClient.ConnectBoundAsync(b.Binding);
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => canceled);
        Assert.AreEqual(b.SessionId, survivor.Binding!.HostSessionId);
        Assert.AreEqual("pong", await survivor.Rpc.PingAsync());
    }
    [TestMethod]
    public async Task Discovery_has_one_bounded_handshake_deadline_for_unresponsive_candidates()
    {
        await using var a = new FakeBindingHost { HandshakeDelayMilliseconds = 10_000 };
        await using var b = new FakeBindingHost("v2");
        var started = System.Diagnostics.Stopwatch.StartNew();
        var candidates = await QuickerRpcHostDiscovery.DiscoverAsync(new QuickerRpcHostSelection
        { CandidateEndpoints = new[] { a.Endpoint, b.Endpoint }, HandshakeTimeoutMilliseconds = 200 });
        Assert.AreEqual(1, candidates.Count);
        Assert.AreEqual(b.SessionId, candidates[0].HostSessionId);
        Assert.IsTrue(started.Elapsed < TimeSpan.FromSeconds(2));
    }

}
