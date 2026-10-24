using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;
using StreamJsonRpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ResourceCatalogEntryPointTests
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Payload(ServeInvokeResponse value) => JsonSerializer.SerializeToElement(value.Data, Json).GetProperty("payload");

    [TestMethod]
    public void Narrow_catalog_methods_are_independent_read_capabilities_without_a_write_fallback()
    {
        var action = nameof(IQuickerRpcService.GetActionResourceCatalogPageAsync);
        var subprogram = nameof(IQuickerRpcService.GetGlobalSubProgramResourceCatalogPageAsync);
        Assert.IsTrue(QuickerRpcMethodPolicy.IsReadOnly(action)); Assert.IsTrue(QuickerRpcMethodPolicy.IsReadOnly(subprogram));
        Assert.AreEqual("resource.action.page.read", QuickerRpcMethodPolicy.Capability(action));
        Assert.AreEqual("resource.globalSubprogram.page.read", QuickerRpcMethodPolicy.Capability(subprogram));
        Assert.IsFalse(QuickerRpcMethodPolicy.IsReadOnly("UnknownFutureCatalogMethod"));
    }

    [TestMethod]
    public async Task Actual_bound_cli_reads_all_1253_raw_rows_with_exact_versions_and_stable_window_snapshot()
    {
        await using var host = new CatalogHost(); await using var other = new CatalogHost();
        var ids = new List<string>(); string? snapshot = null;
        for (var skip = 0; skip < 1253; skip += 500)
        {
            var arguments = new List<string> { "action", "catalog-page", "--skip", skip.ToString(), "--take", "500" };
            if (snapshot is not null) arguments.AddRange(new[] { "--snapshot-id", snapshot });
            var cli = await Cli(host.Binding, arguments.ToArray()); Assert.AreEqual(0, cli.Code, cli.Output);
            using var json = JsonDocument.Parse(cli.Output); var page = json.RootElement.GetProperty("payload");
            snapshot ??= page.GetProperty("snapshotId").GetString(); Assert.AreEqual(snapshot, page.GetProperty("snapshotId").GetString());
            Assert.AreEqual(1253, page.GetProperty("totalCount").GetInt32()); Assert.AreEqual(skip, page.GetProperty("skip").GetInt32());
            Assert.AreEqual(skip + 500 < 1253, page.GetProperty("hasMore").GetBoolean());
            foreach (var row in page.GetProperty("items").EnumerateArray())
            {
                ids.Add(row.GetProperty("id").GetString()!); Assert.AreEqual("-9223372036854775808", row.GetProperty("editVersion").GetString());
                Assert.AreEqual("fa:Light_Flask:#010203", row.GetProperty("icon").GetString());
                Assert.AreEqual("XAction", row.GetProperty("actionType").GetString()); Assert.AreEqual(JsonValueKind.Null, row.GetProperty("callIdentifier").ValueKind);
            }
            Assert.AreEqual(host.Info.HostSessionId, json.RootElement.GetProperty("hostBinding").GetProperty("hostSessionId").GetString());
        }
        Assert.AreEqual(1253, ids.Distinct(StringComparer.Ordinal).Count()); Assert.AreEqual(3, host.Target.ActionReads);
        var sub = await Cli(host.Binding, "subprogram", "catalog-page", "--query", " raw ", "--take", "1"); Assert.AreEqual(0, sub.Code, sub.Output);
        using (var json = JsonDocument.Parse(sub.Output))
        {
            var page = json.RootElement.GetProperty("payload"); Assert.AreEqual("global_subprogram", page.GetProperty("kind").GetString());
            Assert.AreEqual("raw", page.GetProperty("query").GetString()); Assert.AreEqual("global:0000", page.GetProperty("items")[0].GetProperty("callIdentifier").GetString());
        }
        Assert.AreEqual(1, host.Target.SubProgramReads); Assert.AreEqual(0, other.Target.Handshakes + other.Target.ActionReads + other.Target.SubProgramReads);
    }

    [TestMethod]
    public async Task Serve_validates_before_connecting_and_propagates_catalog_changed_busy_and_unsupported()
    {
        await using var host = new CatalogHost(); await using var pool = new QkrpcRpcSessionPool(2, false);
        foreach (var invalid in new[] { Args(new { }), Args(new { kind = "other" }), Args(new { kind = "action", scope = "sql" }),
            Args(new { kind = "action", skip = 1.2 }), Args(new { kind = "action", take = "2" }), Args(new { kind = "action", query = false }),
            Args(new { kind = "action", expectedSnapshotId = 4 }) })
        {
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", invalid, 2, default, host.Binding);
            Assert.AreEqual("INVALID_RESOURCE_CATALOG_REQUEST", result.Error);
        }
        var later = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action", skip = 500 }), 2, default, host.Binding);
        Assert.AreEqual("SNAPSHOT_REQUIRED", later.Error); Assert.AreEqual(0, host.Target.Handshakes);
        // A session selector must not trigger discovery/handshake for an invalid request.
        var invalidSelected = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page",
            Args(new { kind = "other", hostSessionId = host.Info.HostSessionId }), 2, default);
        Assert.AreEqual("INVALID_RESOURCE_CATALOG_REQUEST", invalidSelected.Error);
        var laterSelected = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page",
            Args(new { kind = "action", skip = 500, hostSessionId = host.Info.HostSessionId }), 2, default);
        Assert.AreEqual("SNAPSHOT_REQUIRED", laterSelected.Error); Assert.AreEqual(0, host.Target.Handshakes);
        var invalidCli = await Cli(host.Binding, "action", "catalog-page", "--skip", "500"); Assert.AreEqual(1, invalidCli.Code);
        Assert.AreEqual(0, host.Target.Handshakes);
        var first = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action", take = 1 }), 2, default, host.Binding);
        Assert.IsTrue(first.Ok, first.Message); var snapshot = Payload(first).GetProperty("snapshotId").GetString();
        host.Target.Revision++;
        var changed = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action", skip = 1, expectedSnapshotId = snapshot }), 2, default, host.Binding);
        Assert.AreEqual("CATALOG_CHANGED", changed.Error); Assert.AreEqual(0, Payload(changed).GetProperty("items").GetArrayLength());
        host.Target.Failure = "CATALOG_BUSY";
        var busy = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action" }), 2, default, host.Binding);
        Assert.AreEqual("CATALOG_BUSY", busy.Error); Assert.IsFalse(busy.Ok);
        await using var unsupported = new CatalogHost(action: false);
        var denied = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action" }), 2, default, unsupported.Binding);
        Assert.AreEqual(QuickerRpcBindingErrors.Unsupported, denied.Error); Assert.AreEqual(0, unsupported.Target.ActionReads);
        var supported = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "global_subprogram", take = 1 }), 2, default, unsupported.Binding);
        Assert.IsTrue(supported.Ok, supported.Message); Assert.AreEqual(1, unsupported.Target.SubProgramReads);
    }

    [TestMethod]
    public async Task Actual_http_keeps_page_facts_and_abort_cannot_publish_a_page_or_touch_another_owner()
    {
        await using var host = new CatalogHost(); await using var other = new CatalogHost();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await using var gateway = new QkrpcHttpHost("127.0.0.1", 0, 2, false); var running = gateway.RunAsync(stop.Token);
        try
        {
            while (gateway.Address is null || gateway.Address.EndsWith(":0", StringComparison.Ordinal)) await Task.Delay(10, stop.Token);
            using var http = new HttpClient();
            foreach (var kind in new[] { "action", "global_subprogram" })
            {
                using var content = new StringContent(JsonSerializer.Serialize(new { op = "resource.catalog.page", args = new { kind, take = 2 }, hostBinding = host.Binding }, Json), System.Text.Encoding.UTF8, "application/json");
                using var response = await http.PostAsync(gateway.Address + "/v1/invoke", content, stop.Token); var wire = await response.Content.ReadAsStringAsync(stop.Token);
                Assert.IsTrue(response.IsSuccessStatusCode, wire); using var json = JsonDocument.Parse(wire);
                var page = json.RootElement.GetProperty("data").GetProperty("payload"); Assert.AreEqual(1253, page.GetProperty("totalCount").GetInt32());
                Assert.AreEqual(2, page.GetProperty("items").GetArrayLength()); Assert.AreEqual(JsonValueKind.String, page.GetProperty("items")[0].GetProperty("editVersion").ValueKind);
                Assert.AreEqual(kind, page.GetProperty("kind").GetString()); Assert.IsTrue(page.GetProperty("hasMore").GetBoolean());
            }
        }
        finally { stop.Cancel(); await running; }
        await using var pool = new QkrpcRpcSessionPool(2, false); using var pre = new CancellationTokenSource(); pre.Cancel();
        await Cancelled(() => ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action" }), 2, pre.Token, other.Binding));
        Assert.AreEqual(0, other.Target.Handshakes);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        host.Target.Read = async token => { started.SetResult(); await Task.Delay(Timeout.Infinite, token); return new(); };
        using var cancel = new CancellationTokenSource();
        var pending = ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action" }), 5, cancel.Token, host.Binding);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
        var survivor = await ServeInvokeDispatcher.InvokeAsync(pool, "resource.catalog.page", Args(new { kind = "action", take = 1 }), 2, default, other.Binding);
        Assert.IsTrue(survivor.Ok, survivor.Message); cancel.Cancel(); await Cancelled(() => pending);
        Assert.AreEqual(1, other.Target.ActionReads); Assert.AreEqual(0, other.Target.SubProgramReads);
    }

    private static async Task Cancelled(Func<Task> action)
    { try { await action(); } catch (OperationCanceledException) { return; } Assert.Fail("Canceled reads must not return pages."); }

    private static async Task<(int Code, string Output)> Cli(QuickerRpcHostBinding binding, params string[] args)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in args.Concat(new[] { "--host-binding", JsonSerializer.Serialize(binding, Json), "--no-bootstrap", "--timeout", "2", "--json" })) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
        using var child = Process.Start(start)!; var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await child.WaitForExitAsync(stop.Token); } catch { if (!child.HasExited) child.Kill(true); throw; }
        return (child.ExitCode, await stdout + await stderr);
    }

    public sealed class CatalogTarget(CatalogHost owner)
    {
        public int Handshakes, ActionReads, SubProgramReads;
        public long Revision;
        public string? Failure;
        public Func<CancellationToken, Task<QuickerRpcResourceCatalogPageResult>>? Read;
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref Handshakes); return Task.FromResult(owner.Info); }
        public Task<QuickerRpcResourceCatalogPageResult> GetActionResourceCatalogPageAsync(QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref ActionReads); return Page("action", request, cancellationToken); }
        public Task<QuickerRpcResourceCatalogPageResult> GetGlobalSubProgramResourceCatalogPageAsync(QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref SubProgramReads); return Page("global_subprogram", request, cancellationToken); }
        private Task<QuickerRpcResourceCatalogPageResult> Page(string kind, QuickerRpcResourceCatalogPageRequest request, CancellationToken token)
        {
            if (Read is not null) return Read(token);
            if (Failure is not null) return Task.FromResult(new QuickerRpcResourceCatalogPageResult { ErrorCode = Failure, ErrorMessage = Failure, Kind = kind });
            var rows = Enumerable.Range(0, 1253).Select(i => new ResourceCatalogEntry(i.ToString("D4"), "raw " + i.ToString("D4"), "stored", "fa:Light_Flask:#010203", "-9223372036854775808",
                kind == "action" ? "XAction" : null, kind == "global_subprogram" ? "global:" + i.ToString("D4") : null)).ToArray();
            var page = ResourceCatalogPage.Build(kind, new(owner.Info.HostInstanceId, owner.Info.HostSessionId, "owner", "opaque-account", Revision), rows,
                new(request.Scope, request.Query, request.Skip, request.Take, request.ExpectedSnapshotId), token);
            return Task.FromResult(new QuickerRpcResourceCatalogPageResult { Success = page.Success, ErrorCode = page.ErrorCode, ErrorMessage = page.ErrorMessage,
                Kind = page.Kind, Scope = page.Scope, Query = page.Query, Skip = page.Skip, Take = page.Take, SnapshotId = page.SnapshotId,
                TotalCount = page.TotalCount, HasMore = page.HasMore, Items = page.Items.Select(i => new QuickerRpcResourceCatalogItem {
                    Id = i.Id, Title = i.Title, Description = i.Description, Icon = i.Icon, EditVersion = i.EditVersion, ActionType = i.ActionType, CallIdentifier = i.CallIdentifier }).ToList() });
        }
    }

    public sealed class CatalogHost : IAsyncDisposable
    {
        private readonly CancellationTokenSource stop = new();
        private readonly List<JsonRpc> connections = [];
        private readonly Task loop;
        public QuickerRpcHostSessionInfo Info { get; }
        public CatalogTarget Target { get; }
        public QuickerRpcHostBinding Binding => new(Info.HostInstanceId, Info.HostSessionId, Info.Endpoint, 1, 1,
            Info.Host.Kind, Info.Host.QuickerVersion, new Dictionary<string, bool>(Info.Capabilities));
        public CatalogHost(bool action = true)
        {
            var session = Guid.NewGuid().ToString("N");
            Info = new() { HostInstanceId = "catalog-" + session, HostSessionId = session, Endpoint = QuickerRpcEndpointNames.ForSession(session), ProtocolVersion = 1,
                Host = new() { Kind = "v1", QuickerVersion = "fixture" }, Capabilities = new Dictionary<string, bool> {
                    [QuickerRpcHostCapabilityNames.ResourceActionPageRead] = action, [QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead] = true } };
            Target = new(this); loop = Run(NewPipe());
        }
        private NamedPipeServerStream NewPipe() => CurrentUserPipeFixture.Create(Info.Endpoint);
        private async Task Run(NamedPipeServerStream pipe)
        {
            try { while (!stop.IsCancellationRequested) { await pipe.WaitForConnectionAsync(stop.Token);
                lock (connections) connections.Add(StreamJsonRpcFactory.StartListeningServer(pipe, Target)); pipe = NewPipe(); } }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            finally { pipe.Dispose(); }
        }
        public async ValueTask DisposeAsync()
        { stop.Cancel(); try { await loop; } finally { lock (connections) foreach (var rpc in connections) rpc.Dispose(); stop.Dispose(); } }
    }
}
