using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Serve;
using QuickerRpc.Testing;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class StepRunnerCatalogEntryPointTests
{
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Data(ServeInvokeResponse response) => JsonSerializer.SerializeToElement(response.Data,
        new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    [TestMethod]
    public async Task List_and_get_ui_dispatch_to_each_exact_bound_fake_host_without_writes()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(2, false);
        foreach (var host in new[] { a, b })
        {
            var list = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.list", Args(new { limit = 3 }), 2, default, host.Binding);
            Assert.IsTrue(list.Ok, list.Message);
            Assert.AreEqual(host.Info.Host.Kind, Data(list).GetProperty("payload").GetProperty("items")[0].GetProperty("name").GetString());
            var detail = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.getUi", Args(new { key = "sys:fixture" }), 2, default, host.Binding);
            Assert.IsTrue(detail.Ok, detail.Message);
            Assert.AreEqual("step-runner-get-ui", Data(detail).GetProperty("action").GetString());
            StringAssert.Contains(Data(detail).GetRawText(), host.Info.Host.Kind);
            Assert.AreEqual(2, host.CatalogReads);
            Assert.AreEqual(0, host.Writes);
        }
        Assert.AreEqual(a.Binding.HostSessionId, (await pool.ForBinding(a.Binding).GetSessionAsync(default)).Binding!.HostSessionId);
        Assert.AreEqual(b.Binding.HostSessionId, (await pool.ForBinding(b.Binding).GetSessionAsync(default)).Binding!.HostSessionId);
    }

    [TestMethod]
    public async Task Cancelled_catalog_does_not_connect_or_read_a_host()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(2, false);
        using var stop = new CancellationTokenSource(); stop.Cancel();
        try
        {
            await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.list", Args(new { limit = 3 }), 2, stop.Token, host.Binding);
            Assert.Fail("A cancelled catalog request must propagate cancellation.");
        }
        catch (OperationCanceledException) { }
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.Handshakes);
    }
}
