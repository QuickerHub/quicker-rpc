using System.Collections;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class StepRunnerKnowledgeProviderTests
{
    [TestMethod]
    public void Current_native_producer_discovers_new_modules_and_replacement_or_changed_owners()
    {
        List<object>? owner = null;
        var reads = 0;
        StepRunnerKnowledgeProvider.ReadResult Read() => StepRunnerKnowledgeProvider.ReadCurrent(
            () => { reads++; return owner; }, runner => QuickerV2StepRunnerMapper.MapRunner(runner, captureKnowledgeEvidence: true));
        Assert.AreEqual(0, Read().Catalog.Items.Count);
        owner = new();
        Assert.AreEqual(0, Read().Catalog.Items.Count);
        var runner = new NativeRunner();
        owner.Add(runner);
        var found = Read();
        Assert.AreEqual("fixture:new", StepRunnerCatalogMapper.Search(found.Catalog, "fixture:new", 10).Items.Single().Key);
        var first = Detail(found);
        runner.Name = "same owner changed definition";
        var changed = Detail(Read());
        Assert.AreNotEqual(Revision(first), Revision(changed));
        owner = new() { new NativeRunner { Key = "fixture:replacement" } };
        var replacement = Read();
        Assert.IsNull(replacement.Catalog.TryFind("fixture:new"));
        Assert.AreEqual("fixture:replacement", StepRunnerCatalogMapper.Search(replacement.Catalog, "fixture:replacement", 10).Items.Single().Key);
        owner = null;
        Assert.AreEqual(0, Read().Catalog.Items.Count);
        Assert.AreEqual(6, reads, "Each search/detail snapshot must ask the current producer once, including empty results.");
        Assert.AreEqual("Native", first.Value<string>("name"), "A completed knowledge response is a snapshot, not the mutable native owner.");
    }

    [TestMethod]
    public void Content_revision_keeps_exact_control_null_empty_case_whitespace_and_native_defaults()
    {
        var runner = new NativeRunner();
        StepRunnerKnowledgeProvider.ReadResult Read() => StepRunnerKnowledgeProvider.ReadCurrent(() => new[] { runner }, runner => QuickerV2StepRunnerMapper.MapRunner(runner, captureKnowledgeEvidence: true));
        var controls = new string?[] { null, "", " ", "copy", "COPY" };
        var revisions = controls.Select(control =>
        {
            var schema = Detail(Read(), control);
            Assert.IsTrue(JToken.DeepEquals(control is null ? JValue.CreateNull() : new JValue(control), schema["knowledge"]!["requestedControlFieldValue"]));
            return Revision(schema);
        }).ToArray();
        Assert.AreEqual(controls.Length, revisions.Distinct().Count());
        var before = Detail(Read());
        runner.InputParams[0].AllowInput = true;
        var after = Detail(Read());
        Assert.AreNotEqual(Revision(before), Revision(after), "A native false->true change must be visible even when the Agent compressor omits the property.");
        var webMode = Read().Catalog.Items.Single().InputParamDefs.Single().VariableMode;
        runner.InputParams[0].VariableMode = NativeMode.Input;
        var inputMode = Detail(Read());
        Assert.AreEqual(webMode, Read().Catalog.Items.Single().InputParamDefs.Single().VariableMode, "The legacy web projection normalizes native mode 1 to mode 0 for text.");
        Assert.AreNotEqual(Revision(after), Revision(inputMode), "Raw native policy evidence must distinguish normalized modes.");
        runner.InputParams[0].VariableMode = NativeMode.UseVar2;
        Assert.AreNotEqual(Revision(after), Revision(Detail(Read())));
        runner.HelpLink = " https://native.example.test/module#current ";
        var help = Detail(Read());
        Assert.AreEqual(runner.HelpLink, help["knowledge"]!["nativeHelpLink"]!.Value<string>());
        Assert.IsNull(help["helpLink"], "Knowledge must not switch the Agent endpoint to the UI schema.");
        StringAssert.StartsWith(Revision(help), "sha256:");
    }

    [TestMethod]
    public void Bundled_and_unproved_rows_do_not_claim_runtime_definition_or_native_help()
    {
        var row = new StepRunnerDefinition { Key = "sys:if", Name = "Fallback", HelpLink = "https://bundle.example.test/" };
        var read = StepRunnerKnowledgeProvider.ReadCurrent(() => null, _ => throw new AssertFailedException(), () => new[] { row });
        var schema = Detail(read, key: row.Key);
        Assert.AreEqual("bundled-adapter", schema["knowledge"]!["source"]!["kind"]!.Value<string>());
        Assert.AreEqual(JTokenType.Null, schema["knowledge"]!["nativeHelpLink"]!.Type);
        Assert.IsNotNull(schema["docReference"]);
        Assert.AreEqual("bundled-fallback", schema["knowledge"]!["bundledReference"]!["source"]!.Value<string>());
        Assert.IsFalse(string.IsNullOrWhiteSpace(schema["knowledge"]!["bundledReference"]!["bundleVersion"]!.Value<string>()));
        StringAssert.StartsWith(schema["knowledge"]!["bundledReference"]!["indexRevision"]!.Value<string>(), "sha256:");
        var unknown = Detail(new StepRunnerKnowledgeProvider.ReadResult(read.Catalog), key: row.Key);
        Assert.AreEqual("unknown", unknown["knowledge"]!["source"]!["kind"]!.Value<string>());
        Assert.AreEqual(JTokenType.Null, unknown["knowledge"]!["nativeHelpLink"]!.Type);
    }

    [TestMethod]
    public void Failed_native_enumeration_is_not_replaced_by_an_old_response()
    {
        var fail = false;
        StepRunnerKnowledgeProvider.ReadResult Read() => StepRunnerKnowledgeProvider.ReadCurrent(
            () => fail ? throw new InvalidOperationException("current native read failed") : new[] { new NativeRunner() },
            runner => QuickerV2StepRunnerMapper.MapRunner(runner, captureKnowledgeEvidence: true));
        Assert.AreEqual("runtime-definition", Detail(Read())["knowledge"]!["source"]!["kind"]!.Value<string>());
        fail = true;
        Assert.ThrowsException<InvalidOperationException>(() => Read());
    }

    [TestMethod]
    public async Task Knowledge_annotation_does_not_reinterpret_date_shaped_defaults_or_control_strings_Async()
    {
        const string literal = "2026-10-24T16:00:00.1234567+08:00";
        var runner = new NativeRunner();
        runner.InputParams[0].DefaultValue = literal;
        var read = StepRunnerKnowledgeProvider.ReadCurrent(() => new[] { runner }, row => QuickerV2StepRunnerMapper.MapRunner(row, captureKnowledgeEvidence: true));
        var result = StepRunnerKnowledgeProvider.GetDetail(read, runner.Key, literal, true);
        using (var doc = System.Text.Json.JsonDocument.Parse(result.SchemaJson!))
        {
            Assert.AreEqual(literal, doc.RootElement.GetProperty("inputs")[0].GetProperty("default").GetString());
            Assert.AreEqual(literal, doc.RootElement.GetProperty("knowledge").GetProperty("requestedControlFieldValue").GetString());
        }
        var runtime = Runtime(Host(new Port { Override = result.SchemaJson }));
        using var wire = System.Text.Json.JsonDocument.Parse((await runtime.GetStepRunnerDetailAsync(runner.Key, literal)).SchemaJson!);
        Assert.AreEqual(literal, wire.RootElement.GetProperty("inputs")[0].GetProperty("default").GetString());
        Assert.AreEqual("runtime-definition", wire.RootElement.GetProperty("knowledge").GetProperty("source").GetProperty("kind").GetString());
    }

    [DataTestMethod]
    [DataRow(true)]
    [DataRow(false)]
    public async Task Opaque_native_schema_numeric_lexemes_and_original_text_survive_the_provider_and_runtime_Async(bool forAgent)
    {
        const string nativeJson = """
            {
              "stepRunnerKey" : "fixture:new",
              "inputs": [{ "key":"text", "futureNumber": 0.123456789012345678901234567890123456789 }],
              "future": { "int64":9223372036854775807, "large":18446744073709551616, "zero":-0,
                "negativeFloatZero":-0.0, "largeExponent":1.2300e+1234, "smallExponent":1e-1000, "exponent":1E+03,
                "flag":false, "null":null, "date":"2026-10-24T16:00:00.1234567+08:00", "text":"中文 \\u0061 }" }
            }
            """;
        var read = StepRunnerKnowledgeProvider.ReadCurrent(() => new[] { new NativeRunner() }, row => QuickerV2StepRunnerMapper.MapRunner(row, captureKnowledgeEvidence: true));
        var mapped = StepRunnerCatalogMapper.GetDetail(read.Catalog, "fixture:new").Schema!;
        var format = forAgent ? StepRunnerKnowledgeFormats.Agent : StepRunnerKnowledgeFormats.Ui;
        var produced = StepRunnerKnowledgeProvider.DecorateSchema(read, mapped, nativeJson, "", format);
        var port = new Port { Override = produced };
        var runtime = Runtime(Host(port));
        var delivered = (await (forAgent ? runtime.GetStepRunnerDetailAsync("fixture:new", "") : runtime.GetStepRunnerUiDetailAsync("fixture:new", ""))).SchemaJson!;
        StringAssert.StartsWith(delivered, nativeJson.Substring(0, nativeJson.LastIndexOf('}')));
        using var original = System.Text.Json.JsonDocument.Parse(nativeJson);
        using var wire = System.Text.Json.JsonDocument.Parse(delivered);
        foreach (var property in original.RootElement.EnumerateObject())
            Assert.AreEqual(property.Value.GetRawText(), wire.RootElement.GetProperty(property.Name).GetRawText(), property.Name);
        var revision = wire.RootElement.GetProperty("knowledge").GetProperty("schema").GetProperty("revision").GetString();
        var changed = StepRunnerKnowledgeProvider.DecorateSchema(read, mapped,
            nativeJson.Replace("0.123456789012345678901234567890123456789", "0.123456789012345678901234567890123456788"), "", format);
        using var changedDoc = System.Text.Json.JsonDocument.Parse(changed);
        Assert.AreNotEqual(revision, changedDoc.RootElement.GetProperty("knowledge").GetProperty("schema").GetProperty("revision").GetString());
        port.Override = nativeJson;
        using var legacy = System.Text.Json.JsonDocument.Parse((await (forAgent ? runtime.GetStepRunnerDetailAsync("fixture:new") : runtime.GetStepRunnerUiDetailAsync("fixture:new"))).SchemaJson!);
        foreach (var property in original.RootElement.EnumerateObject())
            Assert.AreEqual(property.Value.GetRawText(), legacy.RootElement.GetProperty(property.Name).GetRawText(), "Legacy " + property.Name);
        Assert.AreEqual("unknown", legacy.RootElement.GetProperty("knowledge").GetProperty("source").GetProperty("kind").GetString());
        Assert.AreEqual(format, legacy.RootElement.GetProperty("knowledge").GetProperty("schema").GetProperty("format").GetString());
    }

    [TestMethod]
    public void Ui_projection_reuses_the_current_provider_but_fingerprints_its_own_content()
    {
        var runner = new NativeRunner();
        StepRunnerKnowledgeProvider.ReadResult Read() => StepRunnerKnowledgeProvider.ReadCurrent(() => new[] { runner }, row => QuickerV2StepRunnerMapper.MapRunner(row, captureKnowledgeEvidence: true));
        var snapshot = Read();
        foreach (var control in new string?[] { null, "", " ", " A " })
        {
            var agent = JObject.Parse(StepRunnerKnowledgeProvider.GetDetail(snapshot, runner.Key, control, true).SchemaJson!);
            var ui = JObject.Parse(StepRunnerKnowledgeProvider.GetDetail(snapshot, runner.Key, control, false).SchemaJson!);
            Assert.AreEqual(StepRunnerKnowledgeFormats.Agent, agent["knowledge"]!["schema"]!["format"]!.Value<string>());
            Assert.AreEqual(StepRunnerKnowledgeFormats.Ui, ui["knowledge"]!["schema"]!["format"]!.Value<string>());
            Assert.AreNotEqual(Revision(agent), Revision(ui));
            Assert.IsTrue(JToken.DeepEquals(agent["knowledge"]!["source"], ui["knowledge"]!["source"]));
            Assert.AreEqual(runner.HelpLink, ui["knowledge"]!["nativeHelpLink"]!.Value<string>());
            Assert.IsTrue(JToken.DeepEquals(control is null ? JValue.CreateNull() : new JValue(control), ui["knowledge"]!["requestedControlFieldValue"]));
        }
        var first = JObject.Parse(StepRunnerKnowledgeProvider.GetDetail(snapshot, runner.Key, null, false).SchemaJson!);
        runner.Name = "Updated";
        var updated = JObject.Parse(StepRunnerKnowledgeProvider.GetDetail(Read(), runner.Key, null, false).SchemaJson!);
        Assert.AreNotEqual(Revision(first), Revision(updated));
        Assert.AreEqual("Native", first["name"]!.Value<string>());
    }

    [TestMethod]
    public async Task Ui_runtime_stamps_current_owner_once_and_rejects_mismatched_owner_control_or_key_Async()
    {
        var port = new Port(); var runtime = Runtime(Host(port, QuickerHostKind.V2, "2.fixture"));
        var first = JObject.Parse((await runtime.GetStepRunnerUiDetailAsync("fixture:new", " ")).SchemaJson!);
        Assert.AreEqual(1, port.UiReads); Assert.AreEqual(0, port.Reads);
        Assert.AreEqual("runtime-definition", first["knowledge"]!["source"]!["kind"]!.Value<string>());
        Assert.AreEqual("v2", first["knowledge"]!["source"]!["hostKind"]!.Value<string>());
        Assert.IsTrue(DateTimeOffset.TryParse(first["knowledge"]!["retrievedAt"]!.Value<string>(), out _));
        var again = JObject.Parse((await runtime.GetStepRunnerUiDetailAsync("fixture:new", " ")).SchemaJson!);
        Assert.AreEqual(Revision(first), Revision(again));
        foreach (var field in new[] { "hostInstanceId", "hostSessionId", "endpoint", "hostKind" })
        {
            var wrong = (JObject)first.DeepClone(); wrong["knowledge"]!["source"]![field] = "another-owner";
            port.Override = wrong.ToString(Formatting.None);
            var failed = await runtime.GetStepRunnerUiDetailAsync("fixture:new", " ");
            Assert.IsFalse(failed.Success); StringAssert.Contains(failed.ErrorMessage, "KNOWLEDGE_TARGET_MISMATCH"); Assert.IsNull(failed.SchemaJson);
        }
        foreach (var wrong in new[] { "{\"stepRunnerKey\":\"fixture:other\"}", "{\"stepRunnerKey\":\"fixture:new\",\"knowledge\":{\"requestedControlFieldValue\":\"\"}}" })
        {
            port.Override = wrong;
            Assert.IsFalse((await runtime.GetStepRunnerUiDetailAsync("fixture:new", " ")).Success);
        }
        port.Override = "{\"stepRunnerKey\":\"fixture:new\",\"knowledge\":{\"schemaVersion\":99}}";
        var unknown = JObject.Parse((await runtime.GetStepRunnerUiDetailAsync("fixture:new", " ")).SchemaJson!);
        Assert.AreEqual("unknown", unknown["knowledge"]!["source"]!["kind"]!.Value<string>());
        Assert.AreEqual(StepRunnerKnowledgeFormats.Ui, unknown["knowledge"]!["schema"]!["format"]!.Value<string>());
        using var stop = new CancellationTokenSource(); port.AfterRead = stop.Cancel;
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => runtime.GetStepRunnerUiDetailAsync("fixture:new", cancellationToken: stop.Token));
        var reads = port.UiReads;
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => runtime.GetStepRunnerUiDetailAsync("fixture:new", cancellationToken: stop.Token));
        Assert.AreEqual(reads, port.UiReads); Assert.AreEqual(0, port.Reads);
    }

    [TestMethod]
    public async Task Actual_runtime_read_attaches_its_owner_without_extra_native_or_capability_queries_Async()
    {
        var port = new Port();
        var host = Host(port, QuickerHostKind.V2, "2.3.fixture");
        var runtime = Runtime(host);
        var first = JObject.Parse((await runtime.GetStepRunnerDetailAsync("fixture:new", "" )).SchemaJson!);
        var again = JObject.Parse((await runtime.GetStepRunnerDetailAsync("fixture:new", "" )).SchemaJson!);
        var source = (JObject)first["knowledge"]!["source"]!;
        Assert.AreEqual("runtime-definition", source.Value<string>("kind"));
        Assert.AreEqual("v2", source.Value<string>("hostKind"));
        Assert.AreEqual("2.3.fixture", source.Value<string>("quickerVersion"));
        Assert.AreEqual("fixture-adapter", source.Value<string>("adapterAssembly"));
        Assert.IsFalse(string.IsNullOrWhiteSpace(source.Value<string>("adapterVersion")));
        Assert.IsFalse(string.IsNullOrWhiteSpace(source.Value<string>("endpoint")));
        Assert.AreEqual(Revision(first), Revision(again));
        Assert.AreEqual(source.Value<string>("hostSessionId"), again["knowledge"]!["source"]!.Value<string>("hostSessionId"));
        Assert.IsTrue(DateTimeOffset.TryParse(first["knowledge"]!.Value<string>("retrievedAt"), out _));
        Assert.AreEqual(2, port.Reads);
        var other = JObject.Parse((await Runtime(Host(port, QuickerHostKind.V1, "" )).GetStepRunnerDetailAsync("fixture:new", "")).SchemaJson!);
        Assert.AreNotEqual(source.Value<string>("hostSessionId"), other["knowledge"]!["source"]!.Value<string>("hostSessionId"));
        Assert.AreEqual("unknown", other["knowledge"]!["source"]!.Value<string>("quickerVersion"));
        Assert.AreEqual(Revision(first), Revision(other), "Content revision is not a timestamp or host identity.");
        var wire = System.Text.Json.JsonSerializer.Serialize(await runtime.GetStepRunnerDetailAsync("fixture:new", null));
        var rpc = System.Text.Json.JsonSerializer.Deserialize<QuickerRpcStepRunnerDetailResult>(wire)!;
        Assert.AreEqual(JTokenType.Null, JObject.Parse(rpc.SchemaJson!)["knowledge"]!["requestedControlFieldValue"]!.Type);
    }

    [TestMethod]
    public async Task Legacy_or_malformed_proof_stays_unknown_and_late_cancellation_is_preserved_Async()
    {
        var port = new Port { Override = "{\"stepRunnerKey\":\"fixture:new\",\"inputs\":[],\"knowledge\":{\"schemaVersion\":{},\"schema\":[]}}" };
        var runtime = Runtime(Host(port));
        var schema = JObject.Parse((await runtime.GetStepRunnerDetailAsync("fixture:new", " ")).SchemaJson!);
        Assert.AreEqual("unknown", schema["knowledge"]!["source"]!.Value<string>("kind"));
        Assert.AreEqual(" ", schema["knowledge"]!.Value<string>("requestedControlFieldValue"));
        Assert.AreEqual(JTokenType.Null, schema["knowledge"]!["nativeHelpLink"]!.Type);
        port.Override = "{\"stepRunnerKey\":\"fixture:new\",\"inputs\":[]}";
        schema = JObject.Parse((await runtime.GetStepRunnerDetailAsync("fixture:new")).SchemaJson!);
        Assert.AreEqual("unknown", schema["knowledge"]!["source"]!.Value<string>("kind"));
        using var stop = new CancellationTokenSource();
        port.AfterRead = stop.Cancel;
        var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => runtime.GetStepRunnerDetailAsync("fixture:new", cancellationToken: stop.Token));
        Assert.AreEqual(stop.Token, error.CancellationToken);
        var reads = port.Reads;
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => runtime.GetStepRunnerDetailAsync("fixture:new", cancellationToken: stop.Token));
        Assert.AreEqual(reads, port.Reads);
    }

    [TestMethod]
    public async Task A_schema_for_another_key_is_never_attached_to_the_current_request_owner_Async()
    {
        var port = new Port { Override = "{\"stepRunnerKey\":\"fixture:other\",\"inputs\":[]}" };
        var result = await Runtime(Host(port)).GetStepRunnerDetailAsync("fixture:new");
        Assert.IsFalse(result.Success);
        Assert.IsNull(result.SchemaJson);
        StringAssert.Contains(result.ErrorMessage, "KNOWLEDGE_TARGET_MISMATCH");
        Assert.AreEqual(1, port.Reads);
    }

    private static JObject Detail(StepRunnerKnowledgeProvider.ReadResult read, string? control = null, string key = "fixture:new") =>
        JObject.Parse(StepRunnerKnowledgeProvider.GetDetail(read, key, control, forAgent: true).SchemaJson!);
    private static string Revision(JObject schema) => schema["knowledge"]!["schema"]!.Value<string>("revision")!;

    private static QuickerRpcService Runtime(IQuickerRpcHost host)
    {
        var dependencies = new QuickerRpcRuntimeDependencies(() => throw new AssertFailedException("No catalog fallback."));
        return new(host, new Scheduler(), new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies));
    }
    private static IQuickerRpcHost Host(Port port, QuickerHostKind kind = QuickerHostKind.V1, string version = "1.fixture")
    {
        var host = DispatchProxy.Create<IQuickerRpcHost, HostProxy>();
        ((HostProxy)(object)host).Port = port;
        ((HostProxy)(object)host).Info = new() { Kind = kind, QuickerVersion = version, AdapterAssembly = "fixture-adapter" };
        return host;
    }
    public class HostProxy : DispatchProxy
    {
        internal Port Port = null!;
        internal QuickerRpcHostInfo Info = null!;
        protected override object? Invoke(MethodInfo? method, object?[]? args) => method?.Name switch
        { "get_Info" => Info, "get_StepRunners" => Port, _ => throw new AssertFailedException("No extra host query: " + method?.Name) };
    }
    internal sealed class Port : IQuickerRpcStepRunnerHost
    {
        internal int Reads;
        internal int UiReads;
        internal string? Override;
        internal Action? AfterRead;
        public Task<QuickerRpcStepRunnerDetailResult> GetDetailAsync(string key, string? controlFieldValue = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Reads++;
            return Task.FromResult(Read(key, controlFieldValue, true));
        }
        private QuickerRpcStepRunnerDetailResult Read(string key, string? controlFieldValue, bool forAgent)
        {
            var result = Override is not null ? new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = Override }
                : StepRunnerKnowledgeProvider.GetDetail(StepRunnerKnowledgeProvider.ReadCurrent(() => new[] { new NativeRunner() },
                    runner => QuickerV2StepRunnerMapper.MapRunner(runner, captureKnowledgeEvidence: true)), key, controlFieldValue, forAgent);
            AfterRead?.Invoke();
            return result;
        }
        public Task<QuickerRpcStepRunnerDetailResult> GetUiDetailAsync(string key, string? controlFieldValue = null, CancellationToken cancellationToken = default)
        { cancellationToken.ThrowIfCancellationRequested(); UiReads++; return Task.FromResult(Read(key, controlFieldValue, false)); }
        public Task<QuickerRpcSearchStepRunnersResult> SearchAsync(string keyword, int? maxResults = null, CancellationToken cancellationToken = default) => throw new AssertFailedException();
        public Task<QuickerRpcSearchStepRunnersResult> ListAsync(int? maxResults = null, CancellationToken cancellationToken = default) => throw new AssertFailedException();
        public Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(IList<QuickerRpcActionStepSummaryInput> steps, string? embeddedSubProgramsJson = null, CancellationToken cancellationToken = default) => throw new AssertFailedException();
    }
    private sealed class Scheduler : IQuickerRpcCallScheduler
    {
        public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) { cancellationToken.ThrowIfCancellationRequested(); return action(); }
        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) => throw new AssertFailedException();
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => throw new AssertFailedException();
    }
    private sealed class NoFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string text) => throw new AssertFailedException();
        public void Error(string text) => throw new AssertFailedException();
    }
    public sealed class NativeRunner
    {
        public string Key { get; set; } = "fixture:new";
        public string Name { get; set; } = "Native";
        public string HelpLink { get; set; } = "https://native.example.test/module";
        public List<NativeInput> InputParams { get; } = new() { new() };
        public object[] OutputParams => Array.Empty<object>();
    }
    public enum NativeMode { UseVarOrInput = 0, Input = 1, UseVar2 = 2 }
    public enum NativeType { Text = 0 }
    public sealed class NativeInput
    {
        public string Key => "text";
        public string Name => "Text";
        public NativeType Type => NativeType.Text;
        public NativeMode VariableMode { get; set; }
        public bool AllowInput { get; set; }
        public object DefaultValue { get; set; } = false;
    }
}
