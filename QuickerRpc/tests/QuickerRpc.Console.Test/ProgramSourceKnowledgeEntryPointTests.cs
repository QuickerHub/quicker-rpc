using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ProgramSourceKnowledgeEntryPointTests
{
    private static readonly Assembly Bundle = typeof(ProgramSourceCodec).Assembly;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private const string GuidePrefix = "QuickerRpc.AgentModel.Docs.ActionAuthoring.";

    [TestMethod]
    public async Task Actual_cli_serve_and_mcp_report_the_same_local_codec_without_a_native_host()
    {
        var direct = new ActionAuthoringGuideService().GetDoc("program-source");
        Assert.IsTrue(direct.Success);
        AssertCodec(direct.Codec!);
        AssertProvenance(direct.Provenance!, direct.Markdown!, direct.Schema);

        var cli = await Cli("program-source");
        Assert.AreEqual(ExitCodes.Success, cli.Code, cli.Error);
        Assert.IsTrue(cli.Json["ok"]!.GetValue<bool>());
        await using var pool = new QkrpcRpcSessionPool(1, false);
        var served = await Serve(pool, "program-source");
        var mcp = Parse(await new QkrpcMcpDocsTools().Docs("get", topic: "program-source"));
        foreach (var output in new[] { cli.Json, served, mcp })
        {
            Assert.AreEqual(direct.Markdown, output["markdown"]!.GetValue<string>(), "Wire Markdown must preserve the embedded Unicode text.");
            Assert.IsTrue(JsonNode.DeepEquals(direct.Codec, output["codec"]), output.ToJsonString());
            Assert.IsTrue(JsonNode.DeepEquals(direct.Provenance, output["provenance"]), output.ToJsonString());
            AssertCodec(output["codec"]!);
            AssertProvenance(output["provenance"]!, output["markdown"]!.GetValue<string>(), output["schema"]);
        }
    }

    [TestMethod]
    public void Successful_topics_and_references_have_bundle_provenance_but_only_program_source_has_codec()
    {
        var guides = new ActionAuthoringGuideService();
        var topics = guides.GetDoc(string.Empty).AvailableTopics!;
        CollectionAssert.Contains(topics, "program-source");
        foreach (var topic in topics)
        {
            var doc = guides.GetDoc(topic);
            Assert.IsTrue(doc.Success, topic);
            AssertProvenance(doc.Provenance!, doc.Markdown!, doc.Schema);
            Assert.AreEqual(topic == "program-source", doc.Codec is not null, topic);
        }

        var references = guides.GetDoc("step-modules", "__missing_knowledge_reference__").AvailableReferences!;
        var reference = references.First(value => !value.StartsWith("_", StringComparison.Ordinal));
        var referenced = guides.GetDoc("step-modules", reference);
        Assert.IsTrue(referenced.Success);
        Assert.IsNull(referenced.Codec);
        AssertProvenance(referenced.Provenance!, referenced.Markdown!, referenced.Schema);
    }

    [TestMethod]
    public async Task Unknown_topic_and_reference_never_reuse_metadata_from_a_previous_success()
    {
        var guides = new ActionAuthoringGuideService();
        var mcp = new QkrpcMcpDocsTools();
        await using var pool = new QkrpcRpcSessionPool(1, false);
        Assert.IsNotNull(guides.GetDoc("program-source").Codec);
        Assert.IsNotNull((await Serve(pool, "program-source"))["codec"]);
        Assert.IsNotNull(Parse(await mcp.Docs("get", topic: "program-source"))["codec"]);
        foreach (var query in new[] { (Topic: "__missing_knowledge_topic_中文→__", Reference: (string?)null), (Topic: "program-source", Reference: (string?)"__missing_knowledge_reference_中文→__") })
        {
            var direct = guides.GetDoc(query.Topic, query.Reference);
            Assert.IsFalse(direct.Success);
            Assert.IsNull(direct.Codec);
            Assert.IsNull(direct.Provenance);
            var cli = await Cli(query.Topic, query.Reference);
            Assert.AreEqual(ExitCodes.Error, cli.Code, cli.Error);
            foreach (var result in new[] { cli.Json, await Serve(pool, query.Topic, query.Reference), Parse(await mcp.Docs("get", topic: query.Topic, reference: query.Reference)) })
            {
                Assert.IsFalse(result["ok"]!.GetValue<bool>(), result.ToJsonString());
                StringAssert.Contains(result["errorMessage"]!.GetValue<string>(), query.Reference ?? query.Topic, "Fixture Chinese and arrow must roundtrip through the wire unchanged.");
                Assert.IsNull(result["codec"], "Unknown results must not carry an old codec descriptor.");
                Assert.IsNull(result["provenance"], "Unknown results must not carry old guide provenance.");
            }
        }
    }

    [TestMethod]
    public void Caller_mutation_cannot_change_later_codec_provenance_or_schema_reads()
    {
        var guides = new ActionAuthoringGuideService();
        var first = guides.GetDoc("program-source");
        var codec = first.Codec!.DeepClone();
        var provenance = first.Provenance!.DeepClone();
        first.Codec["nativeSource"]!["read"] = true;
        first.Codec["formats"]!["inputs"]!.AsArray().Clear();
        first.Provenance["source"]!["kind"] = "runtime-definition";
        first.Provenance["indexRevision"] = "mutated by caller";
        var next = guides.GetDoc("program-source");
        Assert.IsTrue(JsonNode.DeepEquals(codec, next.Codec));
        Assert.IsTrue(JsonNode.DeepEquals(provenance, next.Provenance));

        var schemaDoc = guides.GetDoc("action-data-schema");
        var schema = schemaDoc.Schema!.DeepClone();
        schemaDoc.Schema["schemaId"] = "caller schema";
        schemaDoc.Provenance!["contentRevision"] = "caller revision";
        var nextSchema = guides.GetDoc("action-data-schema");
        Assert.IsTrue(JsonNode.DeepEquals(schema, nextSchema.Schema));
        AssertProvenance(nextSchema.Provenance!, nextSchema.Markdown!, nextSchema.Schema);
    }

    [TestMethod]
    public void Descriptor_formats_match_decode_and_do_not_grant_native_capabilities()
    {
        var descriptor = ProgramSourceCodecDescriptor.Describe();
        AssertCodec(descriptor);
        var formats = descriptor["formats"]!;
        var inputs = formats["inputs"]!.AsArray().Select(value => value!.GetValue<string>()).ToArray();
        CollectionAssert.AreEqual(ProgramSourceSchemas.SupportedFormats.ToArray(), inputs);
        foreach (var format in inputs)
        {
            var decoded = ProgramSourceCodec.Decode("$schema: " + format + "\nvariables: []\nsteps: []\n");
            Assert.AreEqual(ProgramSourceSchemas.ActionV1, decoded.Value<string>("$schema"));
            StringAssert.Contains(ProgramSourceCodec.Encode(decoded), formats["output"]!.GetValue<string>());
        }
        Assert.AreEqual("legacy-compatible", formats["omittedInput"]!.GetValue<string>());
        Assert.AreEqual(ProgramSourceSchemas.ActionV1, ProgramSourceCodec.Decode("variables: []\nsteps: []\n").Value<string>("$schema"));
        var unknown = Assert.ThrowsException<ProgramSourceException>(() => ProgramSourceCodec.Decode("$schema: unsupported.fixture.format\nvariables: []\nsteps: []\n"));
        Assert.AreEqual(ProgramSourceCodes.SchemaUnsupported, unknown.Code);
    }

    [TestMethod]
    public void Provenance_revisions_match_actual_embedded_bytes_and_returned_markdown_and_schema()
    {
        var guides = new ActionAuthoringGuideService();
        var source = guides.GetDoc("program-source");
        using (var stream = Bundle.GetManifestResourceStream(GuidePrefix + "program-source.md"))
        {
            Assert.IsNotNull(stream);
            using var reader = new StreamReader(stream, Encoding.UTF8);
            Assert.AreEqual(reader.ReadToEnd(), source.Markdown);
        }
        var schemaDoc = guides.GetDoc("action-data-schema");
        foreach (var pair in new[] { (Topic: "action-data-schema", Resource: "action-data-schema.json"), (Topic: "form-spec", Resource: "form-spec-schema.json") })
        {
            using var resource = Bundle.GetManifestResourceStream("QuickerRpc.AgentModel.Schemas." + pair.Resource);
            Assert.IsNotNull(resource);
            using var reader = new StreamReader(resource, Encoding.UTF8);
            Assert.IsTrue(JsonNode.DeepEquals(JsonNode.Parse(reader.ReadToEnd()), guides.GetDoc(pair.Topic).Schema), pair.Topic);
        }
        foreach (var doc in new[] { source, schemaDoc }) AssertProvenance(doc.Provenance!, doc.Markdown!, doc.Schema);
        Assert.AreEqual(source.Provenance!["indexRevision"]!.GetValue<string>(), schemaDoc.Provenance!["indexRevision"]!.GetValue<string>());
        Assert.AreNotEqual(source.Provenance["contentRevision"]!.GetValue<string>(), schemaDoc.Provenance!["contentRevision"]!.GetValue<string>());
        var actual = schemaDoc.Provenance["contentRevision"]!.GetValue<string>();
        Assert.AreNotEqual(actual, ContentRevision(schemaDoc.Markdown! + "\nfixture change", schemaDoc.Schema));
        var changedSchema = schemaDoc.Schema!.DeepClone(); changedSchema["fixture-only"] = true;
        Assert.AreNotEqual(actual, ContentRevision(schemaDoc.Markdown!, changedSchema));
    }

    private static void AssertCodec(JsonNode descriptor)
    {
        Assert.IsNotNull(descriptor);
        Assert.AreEqual(1, descriptor["schemaVersion"]!.GetValue<int>());
        var source = descriptor["source"]!.AsObject();
        Assert.AreEqual("qkrpc.program-source-codec", source["provider"]!.GetValue<string>());
        Assert.AreEqual("local-codec", source["kind"]!.GetValue<string>());
        Assert.AreEqual(Bundle.GetName().Name, source["assemblyName"]?.GetValue<string>());
        Assert.AreEqual(Bundle.GetName().Version?.ToString(), source["assemblyVersion"]?.GetValue<string>());
        Assert.AreEqual(Bundle.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion, source["informationalVersion"]?.GetValue<string>());
        Assert.AreEqual(typeof(ProgramSourceCodec).Module.ModuleVersionId.ToString("D"), source["moduleVersionId"]?.GetValue<string>());
        var known = new[] { "assemblyName", "assemblyVersion", "informationalVersion", "moduleVersionId" }.All(name => source[name] is not null);
        Assert.AreEqual(known ? "known" : "unknown", source["identityStatus"]!.GetValue<string>());
        Assert.IsFalse(source.ContainsKey("quickerVersion"));
        Assert.IsFalse(source.ContainsKey("hostSessionId"));
        Assert.AreEqual(ProgramSourceSchemas.SourceV1, descriptor["formats"]!["output"]!.GetValue<string>());
        var native = descriptor["nativeSource"]!.AsObject();
        Assert.AreEqual("unknown", native["status"]!.GetValue<string>());
        Assert.IsTrue(native.ContainsKey("read") && native.ContainsKey("write"));
        Assert.IsNull(native["read"]); Assert.IsNull(native["write"]);
        var detached = descriptor.DeepClone().AsObject();
        var revision = detached["descriptorRevision"]!.GetValue<string>(); detached.Remove("descriptorRevision");
        Assert.AreEqual(Revision(Encoding.UTF8.GetBytes(detached.ToJsonString())), revision);
    }

    private static void AssertProvenance(JsonNode provenance, string markdown, JsonNode? schema)
    {
        Assert.IsNotNull(provenance);
        Assert.AreEqual(1, provenance["schemaVersion"]!.GetValue<int>());
        var source = provenance["source"]!.AsObject();
        Assert.AreEqual("qkrpc.guide", source["provider"]!.GetValue<string>());
        Assert.AreEqual("bundled-fallback", source["kind"]!.GetValue<string>());
        Assert.AreEqual(Bundle.GetName().Name, source["assemblyName"]?.GetValue<string>());
        Assert.AreEqual(Bundle.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? Bundle.GetName().Version?.ToString(), source["bundleVersion"]?.GetValue<string>());
        foreach (var nativeField in new[] { "hostKind", "quickerVersion", "hostSessionId", "hostInstanceId", "endpoint" }) Assert.IsFalse(source.ContainsKey(nativeField), nativeField);
        Assert.AreEqual(ContentRevision(markdown, schema), provenance["contentRevision"]!.GetValue<string>());
        Assert.AreEqual(IndexRevision(), provenance["indexRevision"]!.GetValue<string>());
    }

    private static string ContentRevision(string markdown, JsonNode? schema)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject(); writer.WriteString("markdown", markdown); writer.WritePropertyName("schema");
            if (schema is null) writer.WriteNullValue(); else schema.WriteTo(writer);
            writer.WriteEndObject();
        }
        return Revision(stream.ToArray());
    }

    private static string IndexRevision()
    {
        var names = Bundle.GetManifestResourceNames().Where(name => name.StartsWith(GuidePrefix, StringComparison.Ordinal)
            || name.StartsWith("QuickerRpc.AgentModel.Schemas.", StringComparison.Ordinal)).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        Assert.IsTrue(names.Length > 0);
        using var encoded = new MemoryStream();
        using (var writer = new Utf8JsonWriter(encoded))
        {
            writer.WriteStartArray();
            foreach (var name in names)
            {
                using var resource = Bundle.GetManifestResourceStream(name);
                Assert.IsNotNull(resource);
                writer.WriteStartObject(); writer.WriteString("resource", name); writer.WriteString("revision", Revision(SHA256.HashData(resource), alreadyHashed: true)); writer.WriteEndObject();
            }
            writer.WriteEndArray();
        }
        return Revision(encoded.ToArray());
    }

    private static string Revision(byte[] value, bool alreadyHashed = false) => "sha256:" + Convert.ToHexString(alreadyHashed ? value : SHA256.HashData(value)).ToLowerInvariant();
    private static JsonObject Parse(string json) => JsonNode.Parse(json)!.AsObject();

    private static QuickerRpcHostBinding OfflineBinding() => new("fixture-instance", Guid.NewGuid().ToString("N"), "qkrpc-knowledge-offline-" + Guid.NewGuid().ToString("N"), 1, 1, "unknown", "", new Dictionary<string, bool>());
    private static async Task<JsonObject> Serve(QkrpcRpcSessionPool pool, string topic, string? reference = null)
    {
        var response = await ServeInvokeDispatcher.InvokeAsync(pool, "guide.get", JsonSerializer.SerializeToElement(new { topic, reference }), 1, default, OfflineBinding());
        Assert.IsTrue(response.Ok, response.Message);
        return JsonSerializer.SerializeToNode(response.Data, QkrpcJson.CliOutput)!.AsObject();
    }

    private static string Repository()
    {
        for (var path = AppContext.BaseDirectory; path is not null; path = Path.GetDirectoryName(path))
            if (File.Exists(Path.Combine(path, "agent-gui", "package.json"))) return path;
        throw new InvalidOperationException("Fixture repository not found.");
    }
    private static async Task<(int Code, JsonObject Json, string Error)> Cli(string topic, string? reference = null)
    {
        var temporary = Path.Combine(Repository(), ".tmp");
        var owned = Path.Combine(temporary, "program-source-knowledge-" + Guid.NewGuid().ToString("N"));
        AssertPhysicalAncestors(owned);
        Directory.CreateDirectory(owned);
        try
        {
            var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8, CreateNoWindow = true };
            start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
            foreach (var value in new[] { "guide", "get", "--topic", topic, "--json", "--host-binding", JsonSerializer.Serialize(OfflineBinding(), JsonOptions) }) start.ArgumentList.Add(value);
            if (reference is not null) { start.ArgumentList.Add("--reference"); start.ArgumentList.Add(reference); }
            start.Environment.Remove("QKRPC_HOST_SESSION"); start.Environment.Remove("QKRPC_HOST_BINDING");
            start.Environment["DOTNET_CLI_HOME"] = owned;
            start.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1"; start.Environment["DOTNET_NOLOGO"] = "1";
            using var child = Process.Start(start)!;
            var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
            using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            try { await child.WaitForExitAsync(stop.Token); }
            catch { if (!child.HasExited) child.Kill(); throw; }
            var output = await stdout; var error = await stderr;
            return (child.ExitCode, Parse(output), error);
        }
        finally
        {
            var relative = Path.GetRelativePath(temporary, Path.GetFullPath(owned));
            if (relative.StartsWith("program-source-knowledge-", StringComparison.Ordinal) && !relative.Contains(Path.DirectorySeparatorChar)
                && (File.GetAttributes(owned) & FileAttributes.ReparsePoint) == 0)
            {
                AssertPhysicalAncestors(owned);
                Directory.Delete(owned, true);
            }
        }
    }

    private static void AssertPhysicalAncestors(string directory)
    {
        var ancestors = new Stack<string>();
        for (var path = Path.GetFullPath(directory); path is not null; path = Path.GetDirectoryName(path)) ancestors.Push(path);
        foreach (var path in ancestors)
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(path); }
            catch (FileNotFoundException) { continue; }
            catch (DirectoryNotFoundException) { continue; }
            if (((long)attributes & (0x400 | 0x1000 | 0x40000 | 0x400000)) != 0 || (attributes & FileAttributes.Directory) == 0)
                throw new InvalidOperationException("Unsafe owned CLI fixture ancestor: " + path);
        }
    }
}
