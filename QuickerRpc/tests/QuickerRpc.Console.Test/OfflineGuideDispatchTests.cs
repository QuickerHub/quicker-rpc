using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;

namespace QuickerRpc.Console.Test;

[TestClass, DoNotParallelize]
public sealed class OfflineGuideDispatchTests
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value, JsonOptions);
    private static JsonElement Data(ServeInvokeResponse value) => JsonSerializer.SerializeToElement(value.Data, JsonOptions);
    private static readonly ActionAuthoringGuideService Guides = new();

    [TestMethod]
    public async Task Local_guides_ignore_invalid_or_foreign_process_environment_selectors_without_discovery_or_rpc()
    {
        await using var host = new FakeBindingHost();
        var foreign = ForeignBinding(host.Binding);
        foreach (var selection in new[]
        {
            (Name: "invalid binding JSON", Binding: (string?)"not fixture binding JSON", Session: (string?)null),
            (Name: "invalid binding type", Binding: (string?)"42", Session: (string?)null),
            (Name: "foreign binding", Binding: (string?)JsonSerializer.Serialize(foreign, JsonOptions), Session: (string?)null),
            (Name: "foreign session", Binding: (string?)null, Session: (string?)foreign.HostSessionId),
            (Name: "conflicting environment selectors", Binding: (string?)JsonSerializer.Serialize(host.Binding, JsonOptions), Session: (string?)foreign.HostSessionId),
        })
        {
            using var environment = new ProcessSelection(selection.Binding, selection.Session);
            await AssertLocalGuides(host, new Dictionary<string, object?>(), null, selection.Name);
        }
        AssertNoHostReads(host);
    }

    [TestMethod]
    public async Task Local_guides_ignore_argument_selectors_and_explicit_bindings_without_acquiring_a_host_owner()
    {
        await using var host = new FakeBindingHost();
        using var environment = new ProcessSelection(null, null);
        var foreign = ForeignBinding(host.Binding);
        foreach (var selection in new[]
        {
            (Name: "invalid argument binding string", Args: new Dictionary<string, object?> { ["hostBinding"] = "not a binding object" }, Binding: (QuickerRpcHostBinding?)null),
            (Name: "invalid argument binding number", Args: new Dictionary<string, object?> { ["hostBinding"] = 42 }, Binding: (QuickerRpcHostBinding?)null),
            (Name: "foreign argument binding", Args: new Dictionary<string, object?> { ["hostBinding"] = foreign }, Binding: (QuickerRpcHostBinding?)null),
            (Name: "foreign argument session", Args: new Dictionary<string, object?> { ["hostSessionId"] = foreign.HostSessionId }, Binding: (QuickerRpcHostBinding?)null),
            (Name: "conflicting argument selectors", Args: new Dictionary<string, object?> { ["hostBinding"] = host.Binding, ["hostSessionId"] = foreign.HostSessionId }, Binding: (QuickerRpcHostBinding?)null),
            (Name: "explicit owned binding", Args: new Dictionary<string, object?>(), Binding: (QuickerRpcHostBinding?)host.Binding),
            (Name: "explicit foreign binding", Args: new Dictionary<string, object?>(), Binding: (QuickerRpcHostBinding?)foreign),
            (Name: "explicit binding with conflicting session", Args: new Dictionary<string, object?> { ["hostSessionId"] = foreign.HostSessionId }, Binding: (QuickerRpcHostBinding?)host.Binding),
        })
            await AssertLocalGuides(host, selection.Args, selection.Binding, selection.Name);
        AssertNoHostReads(host);
    }

    [TestMethod]
    public async Task Local_guide_validation_and_unknown_operation_results_do_not_depend_on_host_selection()
    {
        await using var host = new FakeBindingHost();
        using var environment = new ProcessSelection("invalid fixture binding JSON", "foreign-fixture-session");
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var discoveries = 0;
        Task<IReadOnlyList<QuickerRpcHostBinding>> Discover(CancellationToken token)
        { discoveries++; return Task.FromResult<IReadOnlyList<QuickerRpcHostBinding>>(Array.Empty<QuickerRpcHostBinding>()); }
        var selectors = new { hostBinding = 42, hostSessionId = "another-fixture-session" };
        var missing = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.get", Args(selectors), 1, default, binding: host.Binding, discoverHosts: Discover);
        Assert.IsFalse(missing.Ok);
        Assert.AreEqual("MISSING_TOPIC", missing.Error);
        Assert.IsNull(missing.HostBinding);
        var unknown = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.get", Args(new
        { topic = "__missing_offline_guide_fixture__", hostBinding = 42, hostSessionId = "another-fixture-session" }), 1, default, binding: host.Binding, discoverHosts: Discover);
        Assert.IsTrue(unknown.Ok, unknown.Message);
        Assert.IsFalse(Data(unknown).GetProperty("ok").GetBoolean());
        Assert.AreEqual(JsonValueKind.Null, Data(unknown).GetProperty("codec").ValueKind);
        Assert.AreEqual(JsonValueKind.Null, Data(unknown).GetProperty("provenance").ValueKind);
        Assert.IsNull(unknown.HostBinding);
        foreach (var operation in new[] { "guide.index", "guide.__fixture_unknown__" })
        {
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(selectors), 1, default, binding: host.Binding, discoverHosts: Discover);
            Assert.IsFalse(result.Ok);
            Assert.AreEqual("UNKNOWN_OP", result.Error, "This change must not invent guide.index semantics.");
            Assert.IsNull(result.HostBinding);
        }
        Assert.AreEqual(0, discoveries);
        Assert.IsNull(pool.Binding);
        AssertNoHostReads(host);
    }

    [TestMethod]
    public async Task Precancelled_local_guides_throw_before_discovery_binding_or_native_reads()
    {
        await using var host = new FakeBindingHost();
        using var environment = new ProcessSelection("invalid fixture binding JSON", "foreign-fixture-session");
        await using var pool = new QkrpcRpcSessionPool(1, false);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var discoveries = 0;
        Task<IReadOnlyList<QuickerRpcHostBinding>> Discover(CancellationToken token)
        { discoveries++; return Task.FromResult<IReadOnlyList<QuickerRpcHostBinding>>(Array.Empty<QuickerRpcHostBinding>()); }
        foreach (var operation in new[] { "guide.get", "guide.search", "guide.index" })
        {
            var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeInvokeDispatcher.InvokeAsync(pool, operation,
                Args(new { topic = "program-source", query = "source", hostBinding = 42 }), 1, cancellation.Token, binding: host.Binding, discoverHosts: Discover));
            Assert.AreEqual(cancellation.Token, error.CancellationToken);
        }
        Assert.AreEqual(0, discoveries);
        AssertNoHostReads(host);
    }

    [TestMethod]
    public async Task Host_operations_still_use_discovery_or_binding_errors_and_only_the_owned_fake_pipe()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(2, false);
        var discoveries = 0;
        Task<IReadOnlyList<QuickerRpcHostBinding>> Discover(CancellationToken token)
        { token.ThrowIfCancellationRequested(); discoveries++; return Task.FromResult<IReadOnlyList<QuickerRpcHostBinding>>(new[] { host.Binding }); }
        using (new ProcessSelection("invalid fixture binding JSON", "foreign-fixture-session"))
        {
            var listed = await ServeInvokeDispatcher.InvokeAsync(pool, "host.list", Args(new { }), 2, default, binding: null, discoverHosts: Discover);
            Assert.IsTrue(listed.Ok, listed.Message);
            Assert.AreEqual(1, discoveries);
            Assert.AreEqual(host.SessionId, Data(listed).GetProperty("candidates")[0].GetProperty("hostSessionId").GetString());
            AssertNoHostReads(host);
        }
        using (new ProcessSelection(null, null))
        {
            discoveries = 0;
            var ping = await ServeInvokeDispatcher.InvokeAsync(pool, "ping", Args(new { hostSessionId = host.SessionId }), 2, default, binding: null, discoverHosts: Discover);
            Assert.IsTrue(ping.Ok, ping.Error + ": " + ping.Message);
            Assert.AreEqual(1, discoveries);
            Assert.AreEqual(host.SessionId, ping.HostBinding!.HostSessionId);
            Assert.AreEqual("pong", Data(ping).GetProperty("pong").GetString());
            Assert.IsTrue(host.Handshakes > 0, "The positive control must actually reach the owned fake host.");
            discoveries = 0;
            var handshakes = host.Handshakes;
            var denied = await ServeInvokeDispatcher.InvokeAsync(pool, "ping", Args(new { hostSessionId = ForeignBinding(host.Binding).HostSessionId }),
                2, default, binding: host.Binding, discoverHosts: Discover);
            Assert.IsFalse(denied.Ok);
            Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, denied.Error);
            Assert.AreEqual(0, discoveries);
            Assert.AreEqual(handshakes, host.Handshakes);
        }
        using (new ProcessSelection("invalid fixture binding JSON", null))
        {
            discoveries = 0;
            var handshakes = host.Handshakes;
            var invalid = await ServeInvokeDispatcher.InvokeAsync(pool, "ping", Args(new { }), 2, default, binding: null, discoverHosts: Discover);
            Assert.IsFalse(invalid.Ok);
            Assert.AreEqual("INVOKE_FAILED", invalid.Error);
            Assert.AreEqual(0, discoveries);
            Assert.AreEqual(handshakes, host.Handshakes);
        }
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.Writes);
    }

    private static async Task AssertLocalGuides(FakeBindingHost host, Dictionary<string, object?> selectors, QuickerRpcHostBinding? binding, string scenario)
    {
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var discoveries = 0;
        Task<IReadOnlyList<QuickerRpcHostBinding>> Discover(CancellationToken token)
        { discoveries++; return Task.FromResult<IReadOnlyList<QuickerRpcHostBinding>>(Array.Empty<QuickerRpcHostBinding>()); }
        var args = new Dictionary<string, object?>(selectors)
        { ["topic"] = "program-source", ["query"] = "program source", ["limit"] = 3 };
        var get = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.get", Args(args), 1, default, binding: binding, discoverHosts: Discover);
        Assert.IsTrue(get.Ok, scenario + ": " + get.Error + ": " + get.Message);
        var data = Data(get);
        Assert.IsTrue(data.GetProperty("ok").GetBoolean(), scenario);
        var direct = Guides.GetDoc("program-source");
        Assert.IsTrue(direct.Success);
        Assert.AreEqual(direct.Markdown, data.GetProperty("markdown").GetString(), scenario);
        Assert.IsTrue(JsonElement.DeepEquals(JsonSerializer.SerializeToElement(direct.Codec, JsonOptions), data.GetProperty("codec")), scenario);
        Assert.IsTrue(JsonElement.DeepEquals(JsonSerializer.SerializeToElement(direct.Provenance, JsonOptions), data.GetProperty("provenance")), scenario);
        Assert.IsNull(get.HostBinding, "An offline guide must not claim a selected host: " + scenario);
        var search = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.search", Args(args), 1, default, binding: binding, discoverHosts: Discover);
        Assert.IsTrue(search.Ok, scenario + ": " + search.Error + ": " + search.Message);
        var searched = Data(search);
        var expected = Guides.Search("program source", 3);
        Assert.AreEqual(expected.Success, searched.GetProperty("ok").GetBoolean(), scenario);
        Assert.AreEqual(expected.Keyword, searched.GetProperty("keyword").GetString(), scenario);
        Assert.AreEqual(expected.MatchCount, searched.GetProperty("matchCount").GetInt32(), scenario);
        Assert.IsTrue(JsonElement.DeepEquals(JsonSerializer.SerializeToElement(expected.Items, JsonOptions), searched.GetProperty("items")), scenario);
        Assert.IsNull(search.HostBinding, scenario);
        var unknown = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.index", Args(args), 1, default, binding: binding, discoverHosts: Discover);
        Assert.IsFalse(unknown.Ok, scenario);
        Assert.AreEqual("UNKNOWN_OP", unknown.Error, scenario);
        Assert.IsNull(unknown.HostBinding, scenario);
        Assert.AreEqual(0, discoveries, "Offline guide operations must never discover a host: " + scenario);
        Assert.IsNull(pool.Binding, scenario);
        AssertNoHostReads(host);
    }

    private static QuickerRpcHostBinding ForeignBinding(QuickerRpcHostBinding source)
    {
        var session = Guid.NewGuid().ToString("N");
        var endpoint = source.Endpoint[..^source.HostSessionId.Length] + session;
        return new(source.HostInstanceId + "-foreign-fixture", session, endpoint, source.ProtocolVersion, source.SchemaVersion,
            source.HostKind, source.QuickerVersion, new Dictionary<string, bool>());
    }
    private static void AssertNoHostReads(FakeBindingHost host)
    {
        Assert.AreEqual(0, host.Handshakes);
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.LegacyReads);
        Assert.AreEqual(0, host.Writes);
    }
    private sealed class ProcessSelection : IDisposable
    {
        private readonly string? binding = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING", EnvironmentVariableTarget.Process);
        private readonly string? session = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION", EnvironmentVariableTarget.Process);
        public ProcessSelection(string? binding, string? session)
        {
            Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", binding, EnvironmentVariableTarget.Process);
            Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", session, EnvironmentVariableTarget.Process);
        }
        public void Dispose()
        {
            Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", binding, EnvironmentVariableTarget.Process);
            Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", session, EnvironmentVariableTarget.Process);
        }
    }
}
