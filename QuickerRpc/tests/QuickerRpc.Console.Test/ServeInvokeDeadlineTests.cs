using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ServeInvokeDeadlineTests
{
    private static JsonElement Args => JsonSerializer.SerializeToElement(new { id = "fixture-action", returnMode = "metadata" });

    private static QuickerRpcHostBinding AbsentBinding()
    {
        var session = Guid.NewGuid().ToString("N");
        return new("fixture-" + session, session, QuickerRpcEndpointNames.ForSession(session), 1, 1,
            "v1", "fixture", new Dictionary<string, bool>());
    }

    [DataTestMethod]
    [DataRow("action.get")]
    [DataRow("ping")]
    public async Task Request_deadline_includes_connection_to_a_missing_endpoint(string op)
    {
        await using var pool = new QkrpcRpcSessionPool(20, false);
        using var stop = new CancellationTokenSource();
        var request = ServeInvokeDispatcher.InvokeAsync(pool, op, Args, 1, stop.Token, AbsentBinding());
        try
        {
            var result = await request.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.IsFalse(result.Ok);
            Assert.AreEqual("RPC_TIMEOUT", result.Error);
        }
        finally
        {
            stop.Cancel();
            try { await request.WaitAsync(TimeSpan.FromSeconds(5)); }
            catch (OperationCanceledException) { }
        }
    }

    [TestMethod]
    public async Task A_queued_request_has_its_own_deadline_without_canceling_the_connection_owner()
    {
        await using var root = new QkrpcRpcSessionPool(20, false);
        var binding = AbsentBinding();
        var pool = root.ForBinding(binding);
        using var ownerStop = new CancellationTokenSource();
        using var requestStop = new CancellationTokenSource();
        // GetSessionAsync enters the available gate synchronously before awaiting its pipe connection.
        var owner = pool.GetRpcAsync(ownerStop.Token);
        var request = ServeInvokeDispatcher.InvokeAsync(root, "action.get", Args, 1, requestStop.Token, binding);
        try
        {
            var result = await request.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.IsFalse(result.Ok);
            Assert.AreEqual("RPC_TIMEOUT", result.Error);
            Assert.IsFalse(owner.IsCompleted, "The expired waiter does not own the first request's connection attempt.");
        }
        finally
        {
            requestStop.Cancel();
            ownerStop.Cancel();
            try { await request.WaitAsync(TimeSpan.FromSeconds(5)); }
            catch (OperationCanceledException) { }
            try { await owner.WaitAsync(TimeSpan.FromSeconds(5)); }
            catch (OperationCanceledException) { }
        }
    }

    [TestMethod]
    public async Task Failure_cleanup_does_not_wait_for_an_unrelated_connection_attempt()
    {
        await using var root = new QkrpcRpcSessionPool(20, false);
        var pool = root.ForBinding(AbsentBinding());
        using var stop = new CancellationTokenSource();
        var owner = pool.GetRpcAsync(stop.Token);
        var cleanup = pool.InvalidateDisconnectedAsync();
        try
        {
            await cleanup.WaitAsync(TimeSpan.FromSeconds(3));
            Assert.IsFalse(owner.IsCompleted);
        }
        finally
        {
            stop.Cancel();
            try { await owner.WaitAsync(TimeSpan.FromSeconds(5)); }
            catch (OperationCanceledException) { }
            await cleanup.WaitAsync(TimeSpan.FromSeconds(5));
        }
    }

    [TestMethod]
    public async Task Handshake_and_operation_share_one_budget_instead_of_starting_a_second_timer()
    {
        await using var host = new FakeBindingHost { HandshakeDelayMilliseconds = 650 };
        await using var pool = new QkrpcRpcSessionPool(20, false);
        var result = await ServeInvokeDispatcher.InvokeAsync(pool, "ping", Args, 1, default, host.Binding)
            .WaitAsync(TimeSpan.FromSeconds(5));
        Assert.IsFalse(result.Ok);
        Assert.AreEqual("RPC_TIMEOUT", result.Error);

        await using var survivor = new FakeBindingHost();
        var healthy = await ServeInvokeDispatcher.InvokeAsync(pool, "ping", Args, 3, default, survivor.Binding);
        Assert.IsTrue(healthy.Ok, healthy.Message);
    }

    [TestMethod]
    public async Task An_expired_source_save_preserves_its_unconfirmed_write_receipt()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(20, false);
        var directory = Path.Combine(Path.GetTempPath(), "qkrpc-deadline-" + Guid.NewGuid().ToString("N"));
        try
        {
            var opened = await ServeInvokeDispatcher.InvokeAsync(pool, "action.open",
                JsonSerializer.SerializeToElement(new { id = Guid.NewGuid().ToString(), dir = directory }), 5, default, host.Binding);
            Assert.IsTrue(opened.Ok, opened.Message);
            host.AsyncApply = async token =>
            {
                await Task.Delay(Timeout.Infinite, token);
                return new QuickerRpcApplyXActionResult();
            };
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save",
                JsonSerializer.SerializeToElement(new { dir = directory }), 1, default, host.Binding)
                .WaitAsync(TimeSpan.FromSeconds(5));
            Assert.AreEqual(QuickerRpcBindingErrors.UnknownWriteResult, result.Error);
            Assert.AreEqual(1, host.Writes);
        }
        finally
        {
            Assert.IsTrue(Path.GetFullPath(directory).StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase));
            Assert.IsTrue(Path.GetFileName(directory).StartsWith("qkrpc-deadline-", StringComparison.Ordinal));
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [TestMethod]
    public async Task Caller_cancellation_preserves_its_token_instead_of_becoming_an_RPC_timeout()
    {
        await using var pool = new QkrpcRpcSessionPool(20, false);
        using var stop = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
        var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() =>
            ServeInvokeDispatcher.InvokeAsync(pool, "action.get", Args, 10, stop.Token, AbsentBinding()))
            .WaitAsync(TimeSpan.FromSeconds(5));
        Assert.AreEqual(stop.Token, error.CancellationToken);
    }
}
