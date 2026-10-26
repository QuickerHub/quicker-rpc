using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CommandLine;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass, DoNotParallelize]
public sealed class StepRunnerKnowledgeFreshnessTests
{
    private const string Key = "sys:fixture";
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    public TestContext TestContext { get; set; } = null!;
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value, JsonOptions);
    private static JsonElement Data(ServeInvokeResponse response) => JsonSerializer.SerializeToElement(response.Data, JsonOptions);
    private static QuickerRpcStepRunnerDetailResult Detail(string version) => new() { Success = true, SchemaJson = Schema(version) };
    private static string Schema(string version) => JsonSerializer.Serialize(new
    {
        stepRunnerKey = Key, version, icon = "fa:Light_Fixture", inputs = new[] { new { key = "trailing ", native = 0, allowed = false, value = (string?)null } },
        futureNativeMetadata = new { schemaRevision = 73, opaque = new object?[] { null, false, 0, " A " } },
    });
    private static JsonElement Payload(ServeInvokeResponse response)
    {
        Assert.IsTrue(response.Ok, response.Error + ": " + response.Message);
        var data = Data(response);
        Assert.IsTrue(data.GetProperty("ok").GetBoolean(), data.GetRawText());
        return data.GetProperty("payload");
    }
    private static object Request(string operation, string? control = null) => operation == "step-runner.search"
        ? new { query = "fixture", limit = 7 } : new { key = Key, controlField = control };
    private static int Reads(FakeBindingHost host, string operation) => operation switch
    {
        "step-runner.search" => host.CatalogSearchReads,
        "step-runner.get" => host.CatalogGetReads,
        _ => host.CatalogGetUiReads,
    };
    private static void SetRead(FakeBindingHost host, string operation, Func<string?, CancellationToken, Task<QuickerRpcStepRunnerDetailResult>> read)
    {
        if (operation == "step-runner.search")
            host.SearchCatalog = async (query, _, token) =>
            {
                var result = await read(query, token);
                return new() { Success = result.Success, ErrorMessage = result.ErrorMessage, Keyword = result.SchemaJson,
                    MatchCount = result.Success ? 1 : 0, Items = new List<QuickerRpcStepRunnerSearchItem> { new() { Key = Key, Name = result.SchemaJson ?? "" } } };
            };
        else if (operation == "step-runner.get") host.GetCatalog = (_, control, token) => read(control, token);
        else host.GetUiCatalog = (_, control, token) => read(control, token);
    }
    private static void AssertVersion(ServeInvokeResponse response, string operation, string version)
    {
        var payload = Payload(response);
        Assert.IsTrue(payload.GetProperty("success").GetBoolean());
        if (operation == "step-runner.search") Assert.AreEqual(Schema(version), payload.GetProperty("keyword").GetString());
        else
        {
            using var expected = JsonDocument.Parse(Schema(version));
            Assert.IsTrue(JsonElement.DeepEquals(expected.RootElement, payload.GetProperty("schema")), payload.GetRawText());
        }
    }

    [DataTestMethod]
    [DataRow("step-runner.search")]
    [DataRow("step-runner.get")]
    [DataRow("step-runner.getUi")]
    public async Task Same_session_repeated_knowledge_reads_observe_definition_changes_failures_and_recovery(string operation)
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(3, false);
        var state = "A";
        SetRead(host, operation, (_, _) => state switch
        {
            "refused" => Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = false, ErrorMessage = "fixture native refusal" }),
            "throw" => throw new InvalidOperationException("fixture native definition failed"),
            _ => Task.FromResult(Detail(state)),
        });
        foreach (var version in new[] { "A", "B" })
        {
            state = version;
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(Request(operation)), 3, default, host.Binding);
            AssertVersion(result, operation, version);
            Assert.AreEqual(host.SessionId, result.HostBinding!.HostSessionId);
        }
        state = "refused";
        var refused = await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(Request(operation)), 3, default, host.Binding);
        Assert.IsTrue(refused.Ok, refused.Message);
        Assert.IsFalse(Data(refused).GetProperty("ok").GetBoolean());
        Assert.IsFalse(Data(refused).GetProperty("payload").GetProperty("success").GetBoolean());
        StringAssert.Contains(Data(refused).GetRawText(), "fixture native refusal");
        Assert.IsFalse(Data(refused).GetProperty("payload").TryGetProperty("schema", out _));
        state = "throw";
        var failed = await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(Request(operation)), 3, default, host.Binding);
        Assert.IsFalse(failed.Ok);
        Assert.AreEqual("INVOKE_FAILED", failed.Error);
        Assert.AreEqual(host.SessionId, failed.HostBinding!.HostSessionId);
        state = "C";
        AssertVersion(await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(Request(operation)), 3, default, host.Binding), operation, "C");
        Assert.AreEqual(5, Reads(host, operation), "Each completed read must reach the same native RPC owner.");
        Assert.AreEqual(1, host.Handshakes);
        Assert.AreEqual(0, host.Writes);
    }

    [DataTestMethod]
    [DataRow("step-runner.get")]
    [DataRow("step-runner.getUi")]
    public async Task Serve_preserves_omitted_null_empty_space_and_case_control_values_and_the_complete_schema_object(string operation)
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(3, false);
        var seen = new List<string?>();
        SetRead(host, operation, (control, _) => { seen.Add(control); return Task.FromResult(Detail("exact")); });
        AssertVersion(await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(new { key = Key }), 3, default, host.Binding), operation, "exact");
        var values = new string?[] { null, "", " ", " A ", "A", "a" };
        foreach (var value in values)
            AssertVersion(await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(new { key = Key, controlField = value }), 3, default, host.Binding), operation, "exact");
        Assert.AreEqual(values.Length + 1, seen.Count);
        Assert.IsNull(seen[0]);
        for (var i = 0; i < values.Length; i++) Assert.AreEqual(values[i], seen[i + 1], $"Control value at {i} changed.");
        Assert.AreEqual(values.Length + 1, Reads(host, operation));
        Assert.AreEqual(0, host.Writes);
    }

    [DataTestMethod]
    [DataRow("step-runner.get")]
    [DataRow("step-runner.getUi")]
    public async Task Serve_rejects_non_string_non_null_control_values_before_catalog_dispatch(string operation)
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(3, false);
        foreach (var value in new object[] { false, 0, new { value = "A" }, new[] { "A" } })
        {
            var result = await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(new { key = Key, controlField = value }), 3, default, host.Binding);
            Assert.IsFalse(result.Ok, Data(result).GetRawText());
            Assert.AreEqual("INVALID_CONTROL_VALUE", result.Error);
        }
        Assert.AreEqual(0, host.CatalogReads);
        Assert.AreEqual(0, host.Writes);
    }

    [DataTestMethod]
    [DataRow("step-runner.search")]
    [DataRow("step-runner.get")]
    [DataRow("step-runner.getUi")]
    public async Task Cancelling_one_catalog_read_keeps_another_waiter_and_the_bound_connection_alive(string operation)
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(5, false);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var surviving = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var canceledAtHost = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        SetRead(host, operation, async (selector, token) =>
        {
            if (selector == "cancel")
            {
                started.TrySetResult();
                try { await Task.Delay(Timeout.Infinite, token); }
                catch (OperationCanceledException) { canceledAtHost.TrySetResult(); throw; }
            }
            surviving.TrySetResult();
            await release.Task.WaitAsync(token);
            return Detail("survived");
        });
        object RequestFor(string value) => operation == "step-runner.search" ? new { query = value } : new { key = Key, controlField = value };
        using var cancel = new CancellationTokenSource();
        var canceled = ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(RequestFor("cancel")), 5, cancel.Token, host.Binding);
        Task<ServeInvokeResponse>? other = null;
        try
        {
            await started.Task.WaitAsync(TimeSpan.FromSeconds(3));
            other = ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(RequestFor("survive")), 5, default, host.Binding);
            await surviving.Task.WaitAsync(TimeSpan.FromSeconds(3));
            cancel.Cancel();
            await Assert.ThrowsExceptionAsync<OperationCanceledException>(async () => await canceled.WaitAsync(TimeSpan.FromSeconds(3)));
            await canceledAtHost.Task.WaitAsync(TimeSpan.FromSeconds(3));
            release.TrySetResult();
            AssertVersion(await other.WaitAsync(TimeSpan.FromSeconds(3)), operation, "survived");
            var session = await pool.ForBinding(host.Binding).GetSessionAsync(default);
            Assert.AreEqual("pong", await session.Rpc.PingAsync());
            Assert.AreEqual(host.SessionId, session.Binding!.HostSessionId);
            Assert.AreEqual(2, Reads(host, operation));
            Assert.AreEqual(0, host.Writes);
        }
        finally
        {
            cancel.Cancel(); release.TrySetResult();
            try { await canceled; } catch (OperationCanceledException) { }
            if (other is not null) await other;
        }
    }

    [TestMethod]
    public async Task Mcp_catalog_tools_read_the_current_bound_fake_host_and_keep_exact_control_literals()
    {
        await using var host = new FakeBindingHost();
        await using var unrelated = new FakeBindingHost("v2");
        using var environment = new BindingEnvironment(host);
        await using var runtime = new QkrpcMcpRuntime(3, false, new QkrpcMcpWorkspaceContext());
        var tools = new QkrpcMcpCatalogTools(runtime);
        var version = "A";
        var seen = new List<string?>();
        host.SearchCatalog = (_, _, _) => Task.FromResult(new QuickerRpcSearchStepRunnersResult { Success = true, Keyword = version });
        host.GetCatalog = (_, control, _) => { seen.Add(control); return Task.FromResult(Detail(version)); };
        foreach (var current in new[] { "A", "B" })
        {
            version = current;
            using var search = JsonDocument.Parse(await tools.QkrpcStepRunnerSearch("fixture"));
            Assert.AreEqual(current, search.RootElement.GetProperty("keyword").GetString());
            using var detail = JsonDocument.Parse(await tools.QkrpcStepRunnerGet(Key));
            Assert.AreEqual(current, detail.RootElement.GetProperty("schema").GetProperty("version").GetString());
            // MCP's established Agent response removes only the UI icon from the native compressed schema.
            var expected = System.Text.Json.Nodes.JsonNode.Parse(Schema(current))!.AsObject(); expected.Remove("icon");
            Assert.IsTrue(JsonElement.DeepEquals(JsonSerializer.SerializeToElement(expected), detail.RootElement.GetProperty("schema")));
        }
        foreach (var value in new string?[] { "", " ", " A ", "A", "a" })
        {
            using var detail = JsonDocument.Parse(await tools.QkrpcStepRunnerGet(Key, value));
            Assert.IsTrue(detail.RootElement.GetProperty("ok").GetBoolean());
            Assert.AreEqual(value, seen[^1]);
        }
        host.GetCatalog = (_, _, _) => Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = false, ErrorMessage = "fixture native refusal" });
        using (var refused = JsonDocument.Parse(await tools.QkrpcStepRunnerGet(Key)))
        {
            Assert.IsFalse(refused.RootElement.GetProperty("success").GetBoolean());
            Assert.IsFalse(refused.RootElement.TryGetProperty("schema", out _));
        }
        host.GetCatalog = (_, _, _) => throw new InvalidOperationException("fixture native exception");
        using (var failed = JsonDocument.Parse(await tools.QkrpcStepRunnerGet(Key))) Assert.IsFalse(failed.RootElement.GetProperty("ok").GetBoolean());
        Assert.AreEqual(2, host.CatalogSearchReads);
        Assert.AreEqual(9, host.CatalogGetReads);
        Assert.AreEqual(0, unrelated.Handshakes);
        Assert.AreEqual(0, host.Writes + unrelated.Writes);
    }

    [DataTestMethod]
    [DataRow("get")]
    [DataRow("get-ui")]
    public async Task Cli_actual_entrypoint_preserves_native_schema_and_exact_control_values(string verb)
    {
        AssertCliControlTokensParseExactly();
        await using var host = new FakeBindingHost();
        var seen = new List<string?>();
        Task<QuickerRpcStepRunnerDetailResult> Read(string _, string? control, CancellationToken token)
        { seen.Add(control); return Task.FromResult(Detail("cli")); }
        host.GetCatalog = Read; host.GetUiCatalog = Read;
        foreach (var control in new string?[] { null, "", " ", " A ", "A", "a" })
        {
            var result = await Cli(host, verb, control);
            Assert.AreEqual(0, result.Code, result.Output);
            using var output = JsonDocument.Parse(result.Output);
            Assert.IsTrue(output.RootElement.GetProperty("ok").GetBoolean());
            using var expected = JsonDocument.Parse(Schema("cli"));
            Assert.IsTrue(JsonElement.DeepEquals(expected.RootElement, output.RootElement.GetProperty("payload").GetProperty("schema")));
            Assert.AreEqual(control, seen[^1], $"CLI changed {JsonSerializer.Serialize(control)}.");
        }
        Assert.AreEqual(6, verb == "get" ? host.CatalogGetReads : host.CatalogGetUiReads);
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task Complete_knowledge_provenance_is_unchanged_through_serve_mcp_and_actual_cli_entrypoints()
    {
        await using var host = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(3, false);
        using var environment = new BindingEnvironment(host);
        await using var runtime = new QkrpcMcpRuntime(3, false, new QkrpcMcpWorkspaceContext());
        var tools = new QkrpcMcpCatalogTools(runtime);
        foreach (var kind in new[] { "runtime-definition", "bundled-adapter", "unknown" })
        {
            var definitionBytes = Encoding.UTF8.GetBytes(Schema("knowledge-" + kind));
            var revision = "sha256:" + Convert.ToHexString(SHA256.HashData(definitionBytes)).ToLowerInvariant();
            var known = kind != "unknown";
            var adapter = typeof(FakeBindingHost).Assembly.GetName();
            var knowledge = new Dictionary<string, object?>
            {
                ["schemaVersion"] = 1,
                ["source"] = new
                {
                    provider = "qkrpc.step-runner", kind,
                    hostKind = known ? host.Info.Host.Kind : null,
                    quickerVersion = known ? host.Info.Host.QuickerVersion : null,
                    adapterAssembly = known ? adapter.Name : null,
                    adapterVersion = known ? adapter.Version?.ToString() : null,
                    hostInstanceId = known ? host.Binding.HostInstanceId : null,
                    hostSessionId = known ? host.Binding.HostSessionId : null,
                    endpoint = known ? host.Binding.Endpoint : null,
                },
                ["schema"] = new { format = "qkrpc.agent-step-runner.v1", revision },
                ["requestedControlFieldValue"] = null,
                ["retrievedAt"] = "2026-10-24T00:00:00.0000000Z",
                ["nativeHelpLink"] = known ? "https://fixture.invalid/native-help" : null,
                ["futureKnowledgeExtension"] = new { explicitZero = 0, explicitFalse = false, nullable = (string?)null },
            };
            if (kind == "bundled-adapter")
                knowledge["bundledReference"] = new { source = "bundled-fallback", bundleVersion = "fixture-bundle", indexRevision = revision };
            var schema = System.Text.Json.Nodes.JsonNode.Parse(definitionBytes)!.AsObject();
            schema["knowledge"] = JsonSerializer.SerializeToNode(knowledge, JsonOptions);
            var schemaJson = schema.ToJsonString();
            var expectedKnowledge = JsonSerializer.SerializeToElement(knowledge, JsonOptions);
            void AssertKnowledge(JsonElement actualSchema)
            {
                var actual = actualSchema.GetProperty("knowledge");
                Assert.IsTrue(JsonElement.DeepEquals(expectedKnowledge, actual), actual.GetRawText());
                if (kind == "unknown")
                {
                    Assert.AreEqual("unknown", actual.GetProperty("source").GetProperty("kind").GetString());
                    foreach (var property in new[] { "hostKind", "quickerVersion", "adapterAssembly", "adapterVersion", "hostInstanceId", "hostSessionId", "endpoint" })
                        Assert.AreEqual(JsonValueKind.Null, actual.GetProperty("source").GetProperty(property).ValueKind, property + " must remain unknown.");
                }
            }
            Task<QuickerRpcStepRunnerDetailResult> Read(string key, string? control, CancellationToken token)
            {
                Assert.AreEqual(Key, key); Assert.IsNull(control);
                return Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = schemaJson });
            }
            host.GetCatalog = Read; host.GetUiCatalog = Read;
            foreach (var operation in new[] { "step-runner.get", "step-runner.getUi" })
                AssertKnowledge(Payload(await ServeInvokeDispatcher.InvokeAsync(pool, operation, Args(new { key = Key }), 3, default, host.Binding)).GetProperty("schema"));
            using (var result = JsonDocument.Parse(await tools.QkrpcStepRunnerGet(Key)))
            {
                Assert.IsTrue(result.RootElement.GetProperty("ok").GetBoolean());
                AssertKnowledge(result.RootElement.GetProperty("schema"));
            }
            foreach (var verb in new[] { "get", "get-ui" })
            {
                var result = await Cli(host, verb, null);
                Assert.AreEqual(0, result.Code, result.Output);
                using var output = JsonDocument.Parse(result.Output);
                Assert.IsTrue(output.RootElement.GetProperty("ok").GetBoolean());
                AssertKnowledge(output.RootElement.GetProperty("payload").GetProperty("schema"));
            }
        }
        Assert.AreEqual(9, host.CatalogGetReads);
        Assert.AreEqual(6, host.CatalogGetUiReads);
        Assert.AreEqual(0, host.Writes);
    }

    [TestMethod]
    public async Task Ui_projection_metadata_survives_serve_and_actual_cli_without_agent_reads()
    {
        await using var host = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(3, false);
        using var environment = new BindingEnvironment(host);
        string schemaJson = "";
        host.GetCatalog = (_, _, _) => throw new AssertFailedException("UI metadata must not query Agent get.");
        host.GetUiCatalog = (key, _, _) =>
        {
            Assert.AreEqual(Key, key);
            return Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = schemaJson });
        };
        foreach (var control in new string?[] { null, "", " Mode " })
        {
            var knowledge = new
            {
                schemaVersion = 1,
                source = new { provider = "qkrpc.step-runner", kind = "runtime-definition", hostKind = "v2",
                    hostInstanceId = host.Binding.HostInstanceId, hostSessionId = host.Binding.HostSessionId, endpoint = host.Binding.Endpoint },
                schema = new { format = "qkrpc.ui-step-runner.v1", revision = "sha256:" + new string('a', 64) },
                requestedControlFieldValue = control, nativeHelpLink = "https://fixture.invalid/native-help",
                retrievedAt = "2026-10-26T00:00:00Z", futureMetadata = new { value = false },
            };
            schemaJson = JsonSerializer.Serialize(new { stepRunnerKey = Key, icon = "fixture-icon", inputs = Array.Empty<object>(), knowledge }, JsonOptions);
            var expected = JsonSerializer.SerializeToElement(knowledge, JsonOptions);
            var delivered = Payload(await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.getUi", Args(new { key = Key, controlField = control }), 3, default, host.Binding)).GetProperty("schema");
            Assert.IsTrue(JsonElement.DeepEquals(expected, delivered.GetProperty("knowledge")));
            Assert.AreEqual("fixture-icon", delivered.GetProperty("icon").GetString());
            var cli = await Cli(host, "get-ui", control); Assert.AreEqual(0, cli.Code, cli.Output);
            using var output = JsonDocument.Parse(cli.Output);
            Assert.IsTrue(JsonElement.DeepEquals(expected, output.RootElement.GetProperty("payload").GetProperty("schema").GetProperty("knowledge")));
        }
        Assert.AreEqual(0, host.CatalogGetReads); Assert.AreEqual(6, host.CatalogGetUiReads); Assert.AreEqual(0, host.Writes);
    }

    private static void AssertCliControlTokensParseExactly()
    {
        using var parser = new Parser(settings => settings.HelpWriter = null);
        foreach (var control in new[] { "", " ", " A ", "A", "a" })
        {
            StepRunnerOptions? result = null;
            parser.ParseArguments<StepRunnerOptions, GuideOptions>(new[] { "step-runner", "get", "--key=" + Key, "--control-field", control })
                .WithParsed<StepRunnerOptions>(value => result = value);
            Assert.IsNotNull(result, "The existing CLI parser must accept the separate value token: " + JsonSerializer.Serialize(control));
            Assert.AreEqual(control, result.ControlField);
        }
    }
    private static async Task<(int Code, string Output)> Cli(FakeBindingHost host, string verb, string? control)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in new[] { "step-runner", verb, "--key=" + Key, "--host-binding", JsonSerializer.Serialize(host.Binding, JsonOptions), "--no-bootstrap", "--json", "--timeout", "3" }) start.ArgumentList.Add(arg);
        if (control is not null) { start.ArgumentList.Add("--control-field"); start.ArgumentList.Add(control); }
        start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
        using var child = Process.Start(start)!;
        var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try { await child.WaitForExitAsync(stop.Token); }
        catch { child.Kill(true); await child.WaitForExitAsync(); throw; }
        return (child.ExitCode, await stdout + await stderr);
    }
    private sealed class BindingEnvironment : IDisposable
    {
        private readonly string? binding = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
        private readonly string? session = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION");
        private readonly string? verbose = Environment.GetEnvironmentVariable("QKRPC_MCP_VERBOSE");
        public BindingEnvironment(FakeBindingHost host)
        {
            Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", JsonSerializer.Serialize(host.Binding, JsonOptions));
            Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", null);
            Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", null);
        }
        public void Dispose()
        {
            Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", binding);
            Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", session);
            Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", verbose);
        }
    }
}
