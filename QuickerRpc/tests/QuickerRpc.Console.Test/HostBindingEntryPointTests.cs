using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class HostBindingEntryPointTests
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "qkrpc-binding-" + Guid.NewGuid().ToString("N"));
    private const string Id = "c48202e2-e309-4723-9d2a-7a83a29b38fb";
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [TestMethod]
    public async Task Cli_source_open_save_bind_and_do_not_write_to_surviving_host_after_exit()
    {
        var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        try
        {
            var opened = await Cli("action", "open", "--id", Id, "--dir", directory, "--host-binding", JsonSerializer.Serialize(a.Binding, JsonOptions), "--no-bootstrap", "--json");
            Assert.AreEqual(0, opened.Code, opened.Output);
            Assert.AreEqual(a.SessionId, ActionSourceWorkspace.Prepare(directory).HostBinding!.HostSessionId);
            var denied = await Cli("action", "save", "--dir", directory, "--host-binding", JsonSerializer.Serialize(b.Binding, JsonOptions), "--json");
            StringAssert.Contains(denied.Output, QuickerRpcBindingErrors.Mismatch);
            Assert.AreEqual(0, a.Writes + b.Writes);
            var saved = await Cli("action", "save", "--dir", directory, "--no-bootstrap", "--json");
            Assert.AreEqual(0, saved.Code, saved.Output);
            Assert.AreEqual(1, a.Writes);
        }
        finally { await a.DisposeAsync(); }
        var disconnected = await Cli("action", "save", "--dir", directory, "--timeout", "1", "--json");
        Assert.AreEqual(1, disconnected.Code, disconnected.Output);
        StringAssert.Contains(disconnected.Output, QuickerRpcBindingErrors.Unavailable);
        Assert.AreEqual(0, b.Writes);
        Assert.AreEqual(0, b.Handshakes);
    }

    [TestMethod]
    public async Task Serve_and_mcp_share_source_binding_and_reject_other_host()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var opened = await ServeInvokeDispatcher.InvokeAsync(pool, "action.open", Args(new { id = Id, dir = directory }), 2, default, a.Binding);
        Assert.IsTrue(opened.Ok, opened.Error + ": " + opened.Message);
        var denied = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save", Args(new { dir = directory }), 2, default, b.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, denied.Error);
        var selectedConflict = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save",
            Args(new { dir = directory, hostSessionId = b.SessionId }), 2, default);
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, selectedConflict.Error);
        var dryRun = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save",
            Args(new { dir = directory, dryRun = true, hostSessionId = "not-a-live-host" }), 2, default);
        Assert.IsTrue(dryRun.Ok, dryRun.Message);
        await using var mcp = new QkrpcMcpRuntime(2, false, new QkrpcMcpWorkspaceContext());
        var saved = await mcp.InvokeOpAsync("action.save", Args(new { dir = directory }));
        StringAssert.Contains(saved, "\"ok\":true");
        Assert.AreEqual(1, a.Writes);
        Assert.AreEqual(0, b.Writes);
        Assert.AreEqual(0, b.Handshakes);
    }

    [TestMethod]
    public async Task Pool_and_catalog_cache_are_isolated_and_keep_destination_after_invalidation()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var pa = pool.ForBinding(a.Binding);
        var pb = pool.ForBinding(b.Binding);
        var sessions = await Task.WhenAll(pa.GetSessionAsync(default), pb.GetSessionAsync(default));
        StepRunnerServeCache.SetSearch(sessions[0].Rpc, "fixture", null, new() { Success = true, Keyword = "A" });
        Assert.IsFalse(StepRunnerServeCache.TryGetSearch(sessions[1].Rpc, "fixture", null, out _));
        Assert.IsTrue(StepRunnerServeCache.TryGetSearch(sessions[0].Rpc, "fixture", null, out var cached));
        Assert.AreEqual("A", cached!.Keyword);
        await pa.InvalidateAsync();
        a.Info.HostInstanceId = "restarted-fixture";
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => pa.GetSessionAsync(default));
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, error.ErrorCode);
        Assert.AreEqual(b.SessionId, (await pb.GetSessionAsync(default)).Binding!.HostSessionId);
        Assert.AreEqual(0, b.Writes);
    }

    [TestMethod]
    public async Task Trace_dedicated_connection_uses_explicit_binding()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        await ServeActionTraceStream.HandleAsync(context, 2, false, default,
            new ServeActionTraceStreamRequest { Id = Id, HostBinding = a.Binding }, pool);
        Assert.AreEqual(1, a.Writes);
        Assert.AreEqual(0, b.Handshakes);
        Assert.AreEqual(0, b.Writes);
        context.Response.Body.Position = 0;
        StringAssert.Contains(await new StreamReader(context.Response.Body).ReadToEndAsync(), "event: done");
    }

    [TestMethod]
    public async Task Real_agent_http_adapter_reaches_the_bound_fake_pipe()
    {
        var root = FindRepo();
        var gui = Path.Combine(root, "agent-gui");
        if (!File.Exists(Path.Combine(gui, "node_modules/tsx/dist/cli.mjs")))
            Assert.Inconclusive("Agent dependencies are not installed in this .NET-only checkout.");
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2");
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using var gateway = new QkrpcHttpHost("127.0.0.1", 0, 2, false);
        var running = gateway.RunAsync(stop.Token);
        try
        {
            while (gateway.Address is null || gateway.Address.EndsWith(":0", StringComparison.Ordinal))
                await Task.Delay(20, stop.Token);
            var start = new ProcessStartInfo("node") { WorkingDirectory = gui, UseShellExecute = false,
                RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var arg in new[] { "--require", "tsx/cjs", "-e",
                "const {invokeQkrpcHttp}=require('./lib/qkrpc-http.ts'); (async()=>{ const r=await invokeQkrpcHttp({op:'action.run',args:{id:'fixture'}},{hostBinding:JSON.parse(process.env.FIXTURE_BINDING)}); console.log(JSON.stringify(r)); process.exit(r?.ok?0:1); })();" })
                start.ArgumentList.Add(arg);
            start.Environment["QKRPC_HTTP_URL"] = gateway.Address;
            start.Environment["FIXTURE_BINDING"] = JsonSerializer.Serialize(a.Binding, JsonOptions);
            using var child = Process.Start(start)!;
            var stdout = child.StandardOutput.ReadToEndAsync();
            var stderr = child.StandardError.ReadToEndAsync();
            await child.WaitForExitAsync(stop.Token);
            Assert.AreEqual(0, child.ExitCode, await stdout + await stderr);
            Assert.AreEqual(1, a.Writes);
            Assert.AreEqual(0, b.Handshakes);
            Assert.AreEqual(0, b.Writes);
        }
        finally { stop.Cancel(); await running; }
    }

    [TestMethod]
    public async Task Direct_dispatcher_filters_source_capability_and_inflight_cancellation_is_scoped()
    {
        await using var a = new FakeBindingHost();
        await using var b = new FakeBindingHost("v2", source: false);
        await using var pool = new QkrpcRpcSessionPool(2, false,
            new QuickerRpcHostSelection { CandidateEndpoints = new[] { a.Endpoint, b.Endpoint } });
        var opened = await ServeInvokeDispatcher.InvokeAsync(pool, "action.open", Args(new { id = Id, dir = directory }), 2, default);
        Assert.IsTrue(opened.Ok, opened.Error + ": " + opened.Message);
        Assert.AreEqual(a.SessionId, opened.HostBinding!.HostSessionId);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var canceledAtHost = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        a.AsyncApply = async token =>
        {
            started.SetResult();
            try { await Task.Delay(Timeout.Infinite, token); }
            catch (OperationCanceledException) { canceledAtHost.SetResult(); throw; }
            return new QuickerRpcApplyXActionResult();
        };
        using var cancel = new CancellationTokenSource();
        var saving = ServeInvokeDispatcher.InvokeAsync(pool, "action.save", Args(new { dir = directory }), 20, cancel.Token);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
        cancel.Cancel();
        var canceled = await saving.WaitAsync(TimeSpan.FromSeconds(3));
        Assert.AreEqual(QuickerRpcBindingErrors.UnknownWriteResult, canceled.Error);
        await canceledAtHost.Task.WaitAsync(TimeSpan.FromSeconds(3));
        // A canceled invocation does not dispose the shared healthy connection.
        var session = await pool.GetSessionAsync(default);
        Assert.AreEqual("pong", await session.Rpc.PingAsync());
        Assert.AreEqual(0, b.Writes);
    }

    private static JsonElement Args(object args) => JsonSerializer.SerializeToElement(args, JsonOptions);
    private static string FindRepo()
    {
        for (var current = AppContext.BaseDirectory; current is not null; current = Path.GetDirectoryName(current))
            if (File.Exists(Path.Combine(current, "agent-gui/package.json"))) return current;
        throw new InvalidOperationException("Fixture repository not found.");
    }

    private static async Task<(int Code, string Output)> Cli(params string[] args)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_SESSION");
        start.Environment.Remove("QKRPC_HOST_BINDING");
        using var child = Process.Start(start)!;
        var stdout = child.StandardOutput.ReadToEndAsync();
        var stderr = child.StandardError.ReadToEndAsync();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await child.WaitForExitAsync(stop.Token); }
        catch { child.Kill(true); throw; }
        return (child.ExitCode, await stdout + await stderr);
    }
}
