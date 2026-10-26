using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;

namespace QuickerRpc.Console.Test;

[TestClass, DoNotParallelize]
public sealed class StepRunnerSchemaReadTests
{
    private const string Key = "fixture:read";
    private const string Numbers = "[9223372036854775807,-0,1e+05,1.2300,0.12345678901234567890123456789]";
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, QkrpcJson.CliOutput);
    private static JsonElement Parse(string value) { using var doc = JsonDocument.Parse(value); return doc.RootElement.Clone(); }
    private static string Schema(FakeBindingHost host, string body, string? control = null, string revision = "A", string kind = "runtime-definition") =>
        "{\"stepRunnerKey\":\"" + Key + "\"," + body + ",\"knowledge\":" + JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            source = new { provider = "qkrpc.step-runner", kind, hostKind = host.Binding.HostKind, hostInstanceId = host.Binding.HostInstanceId,
                hostSessionId = host.SessionId, endpoint = host.Endpoint },
            schema = new { format = "qkrpc.agent-step-runner.v1", revision }, requestedControlFieldValue = control,
            retrievedAt = DateTimeOffset.UtcNow.ToString("O"), nativeHelpLink = "https://fixture.invalid/help",
        }, QkrpcJson.CliOutput) + "}";
    private static QuickerRpcStepRunnerDetailResult Detail(string schema) => new() { Success = true, SchemaJson = schema };
    private static JsonElement Payload(ServeInvokeResponse response)
    {
        Assert.IsTrue(response.Ok, response.Error + ": " + response.Message);
        var data = Json(response.Data);
        return data.GetProperty("payload");
    }
    private static void AssertBounded(JsonElement payload)
    {
        Assert.IsTrue(payload.GetRawText().Length <= StepRunnerSchemaReader.PayloadLimit, payload.GetRawText().Length.ToString());
        var descriptor = payload.GetProperty("schemaRead").EnumerateObject().Where(p => p.Name is not ("content" or "children"))
            .ToDictionary(p => p.Name, p => p.Value);
        Assert.IsTrue(Json(descriptor).GetRawText().Length <= StepRunnerSchemaReader.DescriptorLimit);
    }
    private static string Error(JsonElement payload) => payload.GetProperty("schemaRead").GetProperty("error").GetProperty("code").GetString()!;
    private static JsonElement Direct(string schema, object read, QuickerRpcHostBinding? binding = null, string? control = null)
    {
        if (!StepRunnerSchemaReader.TryPrepare(Key, control, Json(read), out var request, out var failure)) return Json(failure!);
        return Json(StepRunnerSchemaReader.Read(Detail(schema), request!, binding));
    }

    [TestMethod]
    public async Task Serve_pages_current_schema_before_transport_and_preserves_huge_values_and_number_tokens()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(3, false);
        var huge = string.Concat(Enumerable.Repeat("行😀\\\"\n", 18000));
        var hugeJson = JsonSerializer.Serialize(huge, QkrpcJson.CliOutput);
        var body = "\"huge\":" + hugeJson + ",\"numbers\":" + Numbers + ",\"after\":false,\"array\":[" + hugeJson + ",0]";
        Assert.IsTrue(body.Length > 120000);
        host.GetCatalog = (_, control, _) => Task.FromResult(Detail(Schema(host, body, control)));
        host.GetUiCatalog = (_, _, _) => throw new AssertFailedException("Never get-ui.");
        var fixtures = new List<object>();
        async Task<JsonElement> Get(object input)
        {
            var payload = Payload(await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", Json(input), 3, default, host.Binding));
            AssertBounded(payload); Assert.IsTrue(payload.GetProperty("success").GetBoolean(), payload.GetRawText());
            return payload;
        }
        var index = await Get(new { key = Key, read = new { } });
        fixtures.Add(new { ok = true, action = "step-runner-get", payload = index });
        var children = index.GetProperty("schemaRead").GetProperty("children").EnumerateArray().ToArray();
        Assert.IsTrue(children.Any(child => child.GetProperty("pointer").GetString() == "/after"));
        Assert.IsFalse(children.Any(child => child.GetProperty("pointer").GetString() == "/knowledge"));
        Assert.IsFalse(children.Single(child => child.GetProperty("pointer").GetString() == "/after").TryGetProperty("childCount", out _));
        foreach (var (pointer, expected) in new[] { ("/huge", hugeJson), ("/array", "[" + hugeJson + ",0]"), ("/numbers", Numbers) })
        {
            object input = new { key = Key, read = new { pointer, mode = "value" } };
            var rebuilt = new StringBuilder(); var pages = 0;
            while (true)
            {
                var payload = await Get(input); var page = payload.GetProperty("schemaRead");
                Assert.AreEqual(rebuilt.Length, page.GetProperty("offset").GetInt32());
                rebuilt.Append(page.GetProperty("content").GetString()); pages++;
                if (pages == 1) fixtures.Add(new { ok = true, action = "step-runner-get", payload });
                if (page.GetProperty("nextOffset").ValueKind == JsonValueKind.Null)
                {
                    Assert.AreEqual(pages == 1, page.GetProperty("selectedComplete").GetBoolean()); break;
                }
                Assert.IsFalse(page.GetProperty("selectedComplete").GetBoolean());
                input = page.GetProperty("nextRead").Clone();
                Assert.IsTrue(pages < 1000, "Pages must advance.");
            }
            Assert.AreEqual(expected, rebuilt.ToString());
        }
        Assert.IsTrue(host.CatalogGetReads > 50); Assert.AreEqual(0, host.CatalogGetUiReads); Assert.AreEqual(0, host.Writes);
        // Optional explicit export for cross-language budget review; no user directories or host discovery.
        var export = Environment.GetEnvironmentVariable("QKRPC_SCHEMA_READ_FIXTURES");
        if (export is not null)
        {
            using var file = new FileStream(export, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            JsonSerializer.Serialize(file, fixtures, QkrpcJson.CliOutput);
        }
    }

    [TestMethod]
    public async Task Each_page_observes_current_body_source_revision_control_and_owner_without_reuse()
    {
        await using var host = new FakeBindingHost();
        await using var other = new FakeBindingHost("v2");
        await using var pool = new QkrpcRpcSessionPool(3, false);
        var body = "\"value\":" + JsonSerializer.Serialize(new string('x', 10000));
        var schema = Schema(host, body, "");
        host.GetCatalog = (_, _, _) => Task.FromResult(Detail(schema));
        var first = Payload(await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", Json(new { key = Key, controlField = "", read = new { pointer = "/value", mode = "value" } }), 3, default, host.Binding));
        var next = first.GetProperty("schemaRead").GetProperty("nextRead");
        foreach (var changed in new[] { Schema(host, body + ",\"new\":true", ""), Schema(host, body, "", "B"), Schema(host, body, "", kind: "unknown") })
        {
            schema = changed;
            var page = Payload(await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", next, 3, default, host.Binding));
            Assert.AreEqual("SCHEMA_OBSERVATION_STALE", Error(page)); Assert.IsFalse(page.GetProperty("success").GetBoolean());
            Assert.IsFalse(page.GetProperty("schemaRead").TryGetProperty("content", out _));
        }
        var nextRead = next.GetProperty("read");
        Assert.AreEqual("SCHEMA_OBSERVATION_STALE", Error(Direct(Schema(other, body, ""), nextRead, other.Binding, "")));
        Assert.AreEqual("SCHEMA_OBSERVATION_STALE", Error(Direct(Schema(host, body, " "), nextRead, host.Binding, " ")));
        Assert.AreEqual("KNOWLEDGE_TARGET_MISMATCH", Error(Direct(Schema(host, body, ""), nextRead, other.Binding, "")));
        schema = Schema(host, body, "");
        var recovered = Payload(await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", next, 3, default, host.Binding));
        Assert.IsTrue(recovered.GetProperty("success").GetBoolean());
        Assert.AreEqual(5, host.CatalogGetReads);
    }

    [TestMethod]
    public async Task Unknown_metadata_precise_pointers_and_terminal_failures_do_not_invent_authority()
    {
        await using var host = new FakeBindingHost();
        var schema = "{\"stepRunnerKey\":\"" + Key + "\",\"\":null,\"~\":false,\"a/b\":0,\"~1\":true,\"__proto__\":{\"0\":1},\"array\":[null]}";
        foreach (var (pointer, expected) in new[] { ("/", "null"), ("/~0", "false"), ("/a~1b", "0"), ("/~01", "true"), ("/__proto__/0", "1"), ("/array/0", "null") })
        {
            var value = Direct(schema, new { pointer, mode = "value" }, host.Binding);
            Assert.AreEqual(expected, value.GetProperty("schemaRead").GetProperty("content").GetString());
            Assert.AreEqual("unknown", value.GetProperty("knowledgeStatus").GetString());
            Assert.IsTrue(value.GetProperty("schemaRead").TryGetProperty("observation", out _));
        }
        foreach (var pointer in new[] { "/missing", "/array/01", "/array/-", "/array/1", "/Array/0" })
            Assert.AreEqual("SCHEMA_POINTER_NOT_FOUND", Error(Direct(schema, new { pointer, mode = "value" }, host.Binding)));
        foreach (var pointer in new[] { "array", "/~2", "/abc~" })
            Assert.AreEqual("INVALID_SCHEMA_POINTER", Error(Direct(schema, new { pointer }, host.Binding)));
        var invalid = Direct(schema, new { mode = "bad" }, host.Binding);
        Assert.AreEqual("INVALID_SCHEMA_READ", Error(invalid)); Assert.IsFalse(invalid.GetProperty("schemaRead").TryGetProperty("input", out _));
        Assert.AreEqual("OBSERVATION_REQUIRED", Error(Direct(schema, new { mode = "value", offset = 1 }, host.Binding)));
        Assert.AreEqual("AMBIGUOUS_SCHEMA", Error(Direct("{\"stepRunnerKey\":\"" + Key + "\",\"duplicate\":0,\"duplicate\":1}", new { }, host.Binding)));
        Assert.AreEqual("SCHEMA_READ_DESCRIPTOR_TOO_LARGE", Error(Direct(schema, new { pointer = "/" + new string('x', 4000) }, host.Binding)));
        var hugeName = "{\"stepRunnerKey\":\"" + Key + "\",\"" + new string('n', 8000) + "\":0}";
        var first = Direct(hugeName, new { }, host.Binding).GetProperty("schemaRead");
        var next = first.GetProperty("nextRead").GetProperty("read");
        Assert.AreEqual("SCHEMA_CHILD_TOO_LARGE", Error(Direct(hugeName, next, host.Binding)));
        var single = Direct(schema, new { pointer = "/", mode = "value" });
        Assert.IsFalse(single.GetProperty("schemaRead").TryGetProperty("observation", out _));
        Assert.IsTrue(single.GetProperty("schemaRead").GetProperty("selectedComplete").GetBoolean());
        Assert.AreEqual("SCHEMA_READ_OWNER_UNKNOWN", Error(Direct(hugeName, new { mode = "value" })));
        var metaLarge = "{\"stepRunnerKey\":\"" + Key + "\",\"knowledge\":{\"future\":\"" + new string('m', 10000) + "\"}}";
        Assert.AreEqual("omitted", Direct(metaLarge, new { }, host.Binding).GetProperty("knowledgeStatus").GetString());
        var future = "{\"moduleIdentityVNext\":\"future-shape\",\"fields\":[" + Numbers + "],\"knowledge\":{\"schemaVersion\":2,\"source\":{\"provider\":\"qkrpc.step-runner\",\"kind\":\"runtime-definition\"},\"schema\":{\"format\":\"future-agent-projection\"}}}";
        var futurePage = Direct(future, new { pointer = "/fields/0", mode = "value" }, host.Binding);
        Assert.AreEqual("unknown", futurePage.GetProperty("knowledgeStatus").GetString());
        Assert.AreEqual(Numbers, futurePage.GetProperty("schemaRead").GetProperty("content").GetString());
        Assert.IsTrue(futurePage.GetProperty("schemaRead").TryGetProperty("observation", out _));
        var unknownVersion = Schema(host, "\"value\":1").Replace("\"schemaVersion\":1", "\"schemaVersion\":99");
        Assert.AreEqual("unknown", Direct(unknownVersion, new { }, host.Binding).GetProperty("knowledgeStatus").GetString());
    }

    [TestMethod]
    public async Task Real_cli_and_mcp_preserve_exact_control_and_selector_failure_receipts()
    {
        await using var host = new FakeBindingHost();
        var seen = new List<string?>();
        host.GetCatalog = (_, control, _) => { seen.Add(control); return Task.FromResult(Detail(Schema(host, "\"numbers\":" + Numbers, control))); };
        var oldBinding = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
        var oldSession = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION");
        var oldVerbose = Environment.GetEnvironmentVariable("QKRPC_MCP_VERBOSE");
        Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", Json(host.Binding).GetRawText());
        Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", null); Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", null);
        try
        {
            await using var runtime = new QkrpcMcpRuntime(3, true, new QkrpcMcpWorkspaceContext());
            var mcp = new QkrpcMcpCatalogTools(runtime);
            foreach (var control in new string?[] { null, "", " ", "--flag", " MiXeD ", "--schema-read", "--control-field-json" })
            {
                var read = Json(new { pointer = "/numbers", mode = "value" });
                var cli = await Cli(host, control, read); Assert.AreEqual(0, cli.Code, cli.Output);
                var output = Parse(cli.Output); Assert.IsTrue(output.GetProperty("ok").GetBoolean());
                Assert.AreEqual(Numbers, output.GetProperty("payload").GetProperty("schemaRead").GetProperty("content").GetString());
                var mcpOutput = Parse(await mcp.QkrpcStepRunnerGet(Key, control, read: new() { Pointer = "/numbers", Mode = "value" }));
                Assert.AreEqual(Numbers, mcpOutput.GetProperty("schemaRead").GetProperty("content").GetString());
            }
            CollectionAssert.AreEqual(new string?[] { null, null, "", "", " ", " ", "--flag", "--flag", " MiXeD ", " MiXeD ", "--schema-read", "--schema-read", "--control-field-json", "--control-field-json" }, seen);
            foreach (var control in new[] { "", " ", "--schema-read", "--control-field-json" })
            {
                var ordinary = await Cli(host, control, null);
                Assert.AreEqual(0, ordinary.Code, ordinary.Output);
                Assert.AreEqual(control, seen.Last());
                Assert.AreEqual(control, Parse(ordinary.Output).GetProperty("payload").GetProperty("schema").GetProperty("knowledge").GetProperty("requestedControlFieldValue").GetString());
            }
            var missing = Json(new { pointer = "/missing", mode = "value" });
            var failedCli = await Cli(host, "", missing); Assert.AreEqual(1, failedCli.Code);
            Assert.IsFalse(Parse(failedCli.Output).GetProperty("ok").GetBoolean());
            var failedMcp = Parse(await mcp.QkrpcStepRunnerGet(Key, "", read: new() { Pointer = "/missing", Mode = "value" }));
            Assert.IsFalse(failedMcp.GetProperty("ok").GetBoolean()); Assert.AreEqual("SCHEMA_POINTER_NOT_FOUND", failedMcp.GetProperty("schemaRead").GetProperty("error").GetProperty("code").GetString());
            Assert.AreEqual(0, host.CatalogGetUiReads); Assert.AreEqual(0, host.Writes);
        }
        finally { Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", oldBinding); Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", oldSession); Environment.SetEnvironmentVariable("QKRPC_MCP_VERBOSE", oldVerbose); }
    }

    [TestMethod]
    public async Task Read_rejects_unbound_and_cancelled_requests_without_discovery_or_late_result()
    {
        await using var host = new FakeBindingHost();
        await using var pool = new QkrpcRpcSessionPool(3, true);
        using var cancel = new CancellationTokenSource();
        host.GetCatalog = (_, _, _) => { cancel.Cancel(); return Task.FromResult(Detail(Schema(host, "\"value\":0"))); };
        var args = Json(new { key = Key, read = new { } });
        var oldBinding = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
        var oldSession = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION");
        Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", null); Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", null);
        try
        {
            var unbound = await ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", args, 3, default, null,
                _ => throw new AssertFailedException("Schema read cannot discover hosts."));
            Assert.AreEqual("HOST_BINDING_REQUIRED", unbound.Error); Assert.AreEqual(0, host.CatalogReads);
            await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", args, 3, cancel.Token, host.Binding));
            Assert.AreEqual(1, host.CatalogGetReads);
            await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeInvokeDispatcher.InvokeAsync(pool, "step-runner.get", args, 3, cancel.Token, host.Binding));
            Assert.AreEqual(1, host.CatalogGetReads);
        }
        finally { Environment.SetEnvironmentVariable("QKRPC_HOST_BINDING", oldBinding); Environment.SetEnvironmentVariable("QKRPC_HOST_SESSION", oldSession); }
    }

    private static async Task<(int Code, string Output)> Cli(FakeBindingHost host, string? control, JsonElement? read)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in new[] { "step-runner", "get", "--key", Key, "--host-binding", Json(host.Binding).GetRawText(), "--json", "--timeout", "3" }) start.ArgumentList.Add(arg);
        if (read is not null) { start.ArgumentList.Add("--schema-read"); start.ArgumentList.Add(read.Value.GetRawText()); }
        if (control is not null)
        {
            if (read is null)
            {
                if (control.StartsWith("--", StringComparison.Ordinal)) start.ArgumentList.Add("--control-field=" + control);
                else { start.ArgumentList.Add("--control-field"); start.ArgumentList.Add(control); }
            }
            else { start.ArgumentList.Add("--control-field-json"); start.ArgumentList.Add(JsonSerializer.Serialize(control)); }
        }
        start.Environment.Remove("QKRPC_HOST_BINDING"); start.Environment.Remove("QKRPC_HOST_SESSION");
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try { await process.WaitForExitAsync(deadline.Token); }
        catch { process.Kill(true); await process.WaitForExitAsync(); throw; }
        return (process.ExitCode, await stdout + await stderr);
    }
}
