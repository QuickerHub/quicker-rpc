using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;
using StreamJsonRpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class FontAwesomePageEntryPointTests
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Data(ServeInvokeResponse value) => JsonSerializer.SerializeToElement(value.Data, Json);

    [TestMethod]
    public async Task Cli_page_and_serve_dispatch_the_full_window_to_the_exact_owner_without_changing_search()
    {
        await using var first = new PageHost("a"); await using var other = new PageHost("b");
        var cli = await Cli(first.Binding, "fa", "page", "--query", " camera ", "--style", "Brand", "--skip", "24", "--take", "2");
        Assert.AreEqual(0, cli.Code, cli.Output);
        using (var json = JsonDocument.Parse(cli.Output))
        {
            var page = json.RootElement.GetProperty("payload");
            Assert.AreEqual("camera", page.GetProperty("query").GetString()); Assert.AreEqual("Brands", page.GetProperty("style").GetString());
            Assert.AreEqual("a", page.GetProperty("names")[0].GetString()); Assert.AreEqual(24, page.GetProperty("skip").GetInt32());
            Assert.AreEqual(2, page.GetProperty("take").GetInt32()); Assert.AreEqual(500, page.GetProperty("totalCount").GetInt32()); Assert.IsTrue(page.GetProperty("hasMore").GetBoolean());
        }
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var served = await ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", Args(new { query = " camera ", style = "Brand", skip = 24, take = 2 }), 2, default, first.Binding);
        Assert.IsTrue(served.Ok, served.Message); Assert.AreEqual("a", Data(served).GetProperty("payload").GetProperty("names")[0].GetString());
        Assert.AreEqual(first.Binding.HostSessionId, served.HostBinding!.HostSessionId);
        var legacy = await Cli(first.Binding, "fa", "search", "--query", "old", "--limit", "3", "--expand");
        Assert.AreEqual(0, legacy.Code, legacy.Output);
        using (var json = JsonDocument.Parse(legacy.Output))
        {
            var result = json.RootElement; Assert.AreEqual("fa-search", result.GetProperty("action").GetString());
            Assert.AreEqual("legacy", result.GetProperty("names")[0].GetString()); Assert.AreEqual(19, result.GetProperty("matchCount").GetInt32());
            Assert.IsTrue(result.GetProperty("expand").GetBoolean()); Assert.IsFalse(result.TryGetProperty("payload", out _));
        }
        Assert.AreEqual(("old", 3, true), first.Target.LastSearch);
        Assert.AreEqual(2, first.Target.PageReads); Assert.AreEqual(0, other.Target.PageReads + other.Target.Handshakes);
    }

    [TestMethod]
    public async Task Unsupported_capability_or_native_leaf_fails_structurally_without_other_host_or_legacy_fallback()
    {
        await using var unsupported = new PageHost("unsupported", available: false);
        await using var other = new PageHost("other"); await using var pool = new QkrpcRpcSessionPool(2, false);
        var denied = await ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", Args(new { }), 2, default, unsupported.Binding);
        Assert.IsFalse(denied.Ok); Assert.AreEqual(QuickerRpcBindingErrors.Unsupported, denied.Error); Assert.AreEqual(0, unsupported.Target.PageReads);
        unsupported.Info.Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead] = true;
        unsupported.Target.Unsupported = true;
        await using var freshPool = new QkrpcRpcSessionPool(2, false);
        var failed = await ServeInvokeDispatcher.InvokeAsync(freshPool, "fa.page", Args(new { }), 2, default, unsupported.Binding);
        Assert.IsFalse(failed.Ok); Assert.AreEqual("UNSUPPORTED_HOST", failed.Error);
        var cli = await Cli(unsupported.Binding, "fa", "page"); Assert.AreEqual(1, cli.Code, cli.Output);
        using var json = JsonDocument.Parse(cli.Output); Assert.AreEqual("UNSUPPORTED_HOST", json.RootElement.GetProperty("error").GetString());
        Assert.AreEqual(0, unsupported.Target.SearchReads); Assert.AreEqual(0, other.Target.PageReads + other.Target.Handshakes);
    }

    [TestMethod]
    public async Task Invalid_windows_and_preabort_do_not_dispatch_a_page_and_inflight_cancel_does_not_affect_the_other_owner()
    {
        await using var first = new PageHost("a"); await using var other = new PageHost("b"); await using var pool = new QkrpcRpcSessionPool(2, false);
        foreach (var args in new[] { Args(new { skip = 1.5 }), Args(new { take = "2" }), Args(new { query = 4 }), Args(new { style = false }) })
        {
            var invalid = await ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", args, 2, default, first.Binding);
            Assert.AreEqual("INVALID_FA_PAGE_REQUEST", invalid.Error);
        }
        using var pre = new CancellationTokenSource(); pre.Cancel();
        await ExpectCancelledAsync(() => ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", Args(new { }), 2, pre.Token, first.Binding));
        Assert.AreEqual(0, first.Target.PageReads);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        first.Target.Read = async token => { started.SetResult(); await Task.Delay(Timeout.Infinite, token); return new(); };
        using var cancel = new CancellationTokenSource();
        var pending = ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", Args(new { }), 5, cancel.Token, first.Binding);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var survivor = await ServeInvokeDispatcher.InvokeAsync(pool, "fa.page", Args(new { }), 2, default, other.Binding);
        Assert.IsTrue(survivor.Ok, survivor.Message); cancel.Cancel();
        await ExpectCancelledAsync(() => pending);
        Assert.AreEqual(1, first.Target.PageReads); Assert.AreEqual(1, other.Target.PageReads);
    }

    [TestMethod]
    public async Task All_style_survives_actual_cli_and_http_serializers_with_optional_Node_document_route()
    {
        await using var host = new PageHost("all-styles");
        var cli = await Cli(host.Binding, "fa", "page", "--take", "2"); Assert.AreEqual(0, cli.Code, cli.Output);
        using (var json = JsonDocument.Parse(cli.Output)) Assert.AreEqual(JsonValueKind.Null, json.RootElement.GetProperty("payload").GetProperty("style").ValueKind);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using var gateway = new QkrpcHttpHost("127.0.0.1", 0, 2, false);
        var running = gateway.RunAsync(stop.Token);
        try
        {
            while (gateway.Address is null || gateway.Address.EndsWith(":0", StringComparison.Ordinal)) await Task.Delay(10, stop.Token);
            using var http = new HttpClient();
            using var content = new StringContent(JsonSerializer.Serialize(new { op = "fa.page", args = new { take = 2 }, hostBinding = host.Binding }, Json), System.Text.Encoding.UTF8, "application/json");
            using var response = await http.PostAsync(gateway.Address + "/v1/invoke", content, stop.Token);
            var wire = await response.Content.ReadAsStringAsync(stop.Token); Assert.IsTrue(response.IsSuccessStatusCode, wire);
            using (var json = JsonDocument.Parse(wire)) Assert.AreEqual(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("payload").GetProperty("style").ValueKind);
            if (Environment.GetEnvironmentVariable("QKRPC_TEST_FA_PAGE_NODE_ROUTE") == "1")
            {
                var repo = FindRepo();
                Assert.IsTrue(File.Exists(Path.Combine(repo, "agent-gui/node_modules/tsx/dist/cli.mjs")),
                    "QKRPC_TEST_FA_PAGE_NODE_ROUTE=1 requires the checkout's Agent dependencies.");
                await ReadThroughNodeRouteAsync(repo, host.Binding, wire, cli.Output);
            }
        }
        finally { stop.Cancel(); await running; }
    }

    private static string FindRepo()
    {
        for (var current = AppContext.BaseDirectory; current is not null; current = Path.GetDirectoryName(current))
            if (File.Exists(Path.Combine(current, "agent-gui/package.json"))) return current;
        throw new InvalidOperationException("Fixture repository not found.");
    }

    private static async Task ReadThroughNodeRouteAsync(string repo, QuickerRpcHostBinding hostBinding, string httpWire, string cliWire)
    {
        const string id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", relative = ".quicker/actions/serializer-seam";
        var parent = Path.Combine(repo, ".tmp"); var root = Path.Combine(parent, "fa-page-wire-" + Guid.NewGuid().ToString("N"));
        var project = Path.Combine(root, relative); Directory.CreateDirectory(Path.Combine(project, ".qkrpc"));
        var record = JsonSerializer.Serialize(new { schemaVersion = 1, kind = "action", actionId = id, hostBinding }, Json);
        await File.WriteAllTextAsync(Path.Combine(project, ".qkrpc/project-binding.json"), record);
        await File.WriteAllTextAsync(Path.Combine(project, "info.json"), JsonSerializer.Serialize(new { id }));
        await File.WriteAllTextAsync(Path.Combine(project, "data.json"), "{\"steps\":[],\"opaque\":9223372036854775807}");
        try
        {
            var start = new ProcessStartInfo("node") { WorkingDirectory = Path.Combine(repo, "agent-gui"), UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var arg in new[] { "--conditions=react-server", "--import", "./scripts/agent-offline-network-guard.mjs", "--require", "tsx/cjs", "-e", """
                const assert=require('node:assert/strict');
                const {POST}=require('./app/api/fa/page/route.ts');
                const record=JSON.parse(process.env.PAGE_BINDING);
                const wires=[JSON.parse(process.env.PAGE_HTTP),{ok:true,data:JSON.parse(process.env.PAGE_CLI)}];
                (async()=>{ for(const wire of wires){ let calls=0;
                  globalThis.fetch=async(url,init)=>{assert.equal(String(url),'http://page-wire.invalid:19477/v1/invoke');
                    const invoke=JSON.parse(init.body);assert.equal(invoke.op,'fa.page');assert.deepEqual(invoke.hostBinding,record.hostBinding);calls++;return Response.json(wire);};
                  const response=await POST(new Request('http://fixture.invalid/api/fa/page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({take:2,catalogContext:{cwd:process.env.PAGE_ROOT,projectDirectory:'.quicker/actions/serializer-seam',expectedProjectBinding:record}})}));
                  const page=await response.json();assert.equal(response.status,200,JSON.stringify(page));assert.equal(page.style,null);assert.equal(page.query,'');assert.equal(page.skip,0);assert.equal(page.take,2);assert.equal(page.totalCount,500);assert.equal(page.hasMore,true);assert.equal(page.names.length,2);assert.equal(calls,1);
                } console.log('actual CLI and HTTP all-style pages accepted by document route'); })().catch(error=>{console.error(error);process.exitCode=1;});
                """ }) start.ArgumentList.Add(arg);
            start.Environment["QKRPC_HTTP_URL"] = "http://page-wire.invalid:19477"; start.Environment["QKRPC_TRANSPORT"] = "http";
            start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
            start.Environment["PAGE_BINDING"] = record; start.Environment["PAGE_ROOT"] = root;
            start.Environment["PAGE_HTTP"] = httpWire; start.Environment["PAGE_CLI"] = cliWire;
            using var child = Process.Start(start)!; var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
            using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            try { await child.WaitForExitAsync(stop.Token); }
            catch { if (!child.HasExited) child.Kill(true); throw; }
            Assert.AreEqual(0, child.ExitCode, await stdout + await stderr);
        }
        finally
        {
            Assert.IsTrue(Path.GetFullPath(root).StartsWith(Path.GetFullPath(parent) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
            Directory.Delete(root, true);
        }
    }

    private static async Task ExpectCancelledAsync(Func<Task> action)
    {
        try { await action(); }
        catch (OperationCanceledException) { return; }
        Assert.Fail("Cancellation must propagate instead of returning a successful page.");
    }

    private static async Task<(int Code, string Output)> Cli(QuickerRpcHostBinding binding, params string[] args)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args.Concat(new[] { "--host-binding", JsonSerializer.Serialize(binding, Json), "--no-bootstrap", "--timeout", "2", "--json" })) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
        using var child = Process.Start(start)!; var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await child.WaitForExitAsync(stop.Token); }
        catch { if (!child.HasExited) child.Kill(true); throw; }
        return (child.ExitCode, await stdout + await stderr);
    }

    public sealed class PageTarget(PageHost owner)
    {
        public int PageReads, Handshakes, SearchReads;
        public bool Unsupported;
        public (string?, int, bool) LastSearch;
        public Func<CancellationToken, Task<QuickerRpcFontAwesomePageResult>>? Read;
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref Handshakes); return Task.FromResult(owner.Info); }
        public Task<QuickerRpcFontAwesomePageResult> SearchFontAwesomeIconsPageAsync(string? query, string? style, int skip = 0, int take = 96, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref PageReads);
            if (Read is not null) return Read(cancellationToken);
            if (Unsupported) return Task.FromResult(new QuickerRpcFontAwesomePageResult { ErrorMessage = "UNSUPPORTED_HOST: page leaf unavailable" });
            return Task.FromResult(new QuickerRpcFontAwesomePageResult { Success = true, Names = new[] { owner.Name, "second" }, Query = query?.Trim() ?? "",
                Style = style == "Brand" ? "Brands" : style, Skip = skip, Take = take, TotalCount = 500, HasMore = true });
        }
        public Task<QuickerRpcSearchFontAwesomeIconsResult> SearchFontAwesomeIconsAsync(string? query, int maxResults = 40, bool expand = false, CancellationToken cancellationToken = default)
        {
            SearchReads++; LastSearch = (query, maxResults, expand);
            return Task.FromResult(new QuickerRpcSearchFontAwesomeIconsResult { Success = true, Names = new[] { "legacy" }, MatchCount = 19, DefaultStyle = "Light" });
        }
    }

    public sealed class PageHost : IAsyncDisposable
    {
        private readonly CancellationTokenSource stop = new();
        private readonly List<JsonRpc> connections = [];
        private readonly Task loop;
        public string Name { get; }
        public QuickerRpcHostSessionInfo Info { get; }
        public PageTarget Target { get; }
        public QuickerRpcHostBinding Binding => new(Info.HostInstanceId, Info.HostSessionId, Info.Endpoint, 1, 1,
            Info.Host.Kind, Info.Host.QuickerVersion, new Dictionary<string, bool>(Info.Capabilities));
        public PageHost(string name, bool available = true)
        {
            Name = name; var session = Guid.NewGuid().ToString("N");
            Info = new() { HostInstanceId = "fixture-" + session, HostSessionId = session, Endpoint = QuickerRpcEndpointNames.ForSession(session), ProtocolVersion = 1,
                Host = new() { Kind = "v2", QuickerVersion = "fixture" }, Capabilities = new Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead] = available } };
            Target = new(this); var pipe = NewPipe(); loop = Run(pipe);
        }
        private NamedPipeServerStream NewPipe() => new(Info.Endpoint, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        private async Task Run(NamedPipeServerStream pipe)
        {
            try
            {
                while (!stop.IsCancellationRequested)
                {
                    await pipe.WaitForConnectionAsync(stop.Token);
                    lock (connections) connections.Add(StreamJsonRpcFactory.StartListeningServer(pipe, Target));
                    pipe = NewPipe();
                }
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            finally { pipe.Dispose(); }
        }
        public async ValueTask DisposeAsync()
        {
            stop.Cancel();
            try { await loop; }
            finally
            {
                // The accept loop can publish its last connection while cancellation is queued.
                lock (connections) foreach (var rpc in connections) rpc.Dispose();
                stop.Dispose();
            }
        }
    }
}
