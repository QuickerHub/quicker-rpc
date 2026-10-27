using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class SourceStepIdentityDocumentTests
{
    private const string ActionId = "acfd7ec3-84d6-40ab-b69d-eb6d04125e9f";
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private string directory = string.Empty;
    public TestContext TestContext { get; set; } = null!;

    [TestInitialize]
    public void Initialize()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "QuickerRpc/src/QuickerRpc.Console/ActionSourceWorkspace.cs"))) root = root.Parent;
        Assert.IsNotNull(root);
        directory = Path.Combine(root.FullName, ".tmp", "source-step-identity-document-test-" + Guid.NewGuid().ToString("N"));
    }

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [TestMethod]
    public void Inspect_BindsExactSnapshotCodecAndOriginalRows_WithoutTreatingGeneratedLookingNativeIdsAsSynthetic()
    {
        Open(Native());
        var bytes = Bytes(); var document = Inspect(); AssertEnvelope(document);
        foreach (var id in new[] { "s-1", "qkrpc:actually-native", "child-step" })
        {
            var row = Row(document, id);
            Assert.AreEqual("source", row.Value<string>("provenance"));
            Assert.AreEqual(id, row.Value<string>("sourceId"));
            Assert.AreEqual(id, row.Value<string>("nativeCheckpointId"));
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
            Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
            Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
            Assert.IsTrue(row.Value<bool>("stableIdentityProven"));
            Assert.IsFalse(row.Value<bool>("hasSyntheticAncestor"));
        }
        Assert.AreEqual("/steps/0/ifSteps/0", Row(document, "qkrpc:actually-native")["sourceRowAnchor"]!.Value<string>("path"));
        Assert.AreEqual("sub-child", Row(document, "child-step").Value<string>("surface"));
        AssertBytes(bytes);
        AttachWire("inspect-native.json", document);
    }

    [TestMethod]
    public void NativeIdlessExportAndRawIdlessSource_HaveLocalAnchorsButNeverAcquireNativeIdentity()
    {
        Open(Read("""{"Steps":[{"StepRunnerKey":"future:runner","Note":"before","InputParams":{"text":{"Value":"plain","VarKey":"","Unknown":9223372036854775807}},"Future":{"n":1e999,"nil":null}}],"Variables":[],"SubPrograms":[]}"""));
        var document = Inspect(); var row = Rows(document).Single();
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        var edited = Editor(document); edited["steps"]![0]!["note"] = "local note";
        var saved = Save(document, edited.ToString(Formatting.None)); AssertEnvelope(saved);
        var body = ActionSourceWorkspace.Prepare(directory).Body;
        Assert.IsNull(body["Steps"]![0]!["StepId"]);
        Assert.AreEqual("local note", body["Steps"]![0]!.Value<string>("Note"));
        Assert.AreEqual("9223372036854775807", body["Steps"]![0]!["InputParams"]!["text"]!["Unknown"]!.ToString(Formatting.None));

        var source = Source(); ((JObject)source["steps"]![0]!).Remove("stepId"); WriteSource(source);
        document = Inspect(); AssertEnvelope(document); row = Rows(document).Single();
        Assert.AreEqual("generated", row.Value<string>("provenance"));
        Assert.IsFalse(row.Value<bool>("sourceIdProven")); Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.IsFalse(row.Value<bool>("stableIdentityProven")); Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
        Assert.AreEqual(JTokenType.Null, row["sourceId"]!.Type);
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        Assert.IsNull(Source()["steps"]![0]!["stepId"]);
    }

    [TestMethod]
    public void SourceOnlyIdentity_DoesNotBorrowTheNativeRowAtItsPosition()
    {
        Open(Native()); var source = Source(); source["steps"]![0]!["stepId"] = "source-only"; WriteSource(source);
        var document = Inspect(); AssertEnvelope(document); var row = Row(document, "source-only");
        Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven")); Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven")); Assert.AreEqual(JTokenType.Null, row["nativeCheckpointId"]!.Type);
    }

    [TestMethod]
    public void PreviewAndNewRows_DoNotReceiveObservedRowProof_AndReturnedObjectsCannotMutateTheNextObservation()
    {
        Open(); var before = Inspect(); var bytes = Bytes(); var edited = Editor(before);
        ((JArray)edited["steps"]!).Add(Read("""{"stepId":"new-row","stepRunnerKey":"future:new","inputParams":{"value":"plain"}}"""));
        edited["steps"]![0]!["note"] = "candidate";
        var preview = ActionSourceWorkspace.Document(directory, "preview", Revision(before), edited.ToString(Formatting.None), null, default, before.Value<string>("editorJson"));
        AssertEnvelope(preview, "candidate", before.Value<string>("editorJson"));
        foreach (var row in Rows(preview))
        {
            Assert.IsFalse(row.Value<bool>("stableIdentityProven")); Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
            Assert.AreEqual("candidate-preview", row.Value<string>("documentLocalIdentityDenialReason"));
        }
        Assert.AreEqual(JTokenType.Null, Row(preview, "new-row")["sourceRowAnchor"]!.Type);
        var expected = Identity(before).DeepClone(); Identity(before)["authorizesLive"] = true;
        Row(before, "s-1")["sourceRowAnchor"]!["rowHash"] = "forged";
        Assert.IsTrue(JToken.DeepEquals(expected, Identity(Inspect()))); AssertBytes(bytes);
    }

    [TestMethod]
    public void SyntheticAncestorAndForeignBodies_NeverBecomeProvenOwnedStepSurfaces()
    {
        Open(); var source = Source(); ((JObject)source["subPrograms"]![0]!).Remove("id"); WriteSource(source);
        var document = Inspect(); var row = Row(document, "child-step");
        Assert.IsTrue(row.Value<bool>("hasSyntheticAncestor")); Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("synthetic-surface-ancestor", row.Value<string>("documentLocalIdentityDenialReason"));
        source["subPrograms"]![0]!["kind"] = 2; WriteSource(source); var bytes = Bytes();
        Assert.AreEqual("SOURCE_DOCUMENT_UNSUPPORTED", Assert.ThrowsException<ProgramSourceException>(() => Inspect()).Code); AssertBytes(bytes);
    }

    [TestMethod]
    public void DuplicateAndWhitespaceIdentityAliases_CannotProduceStepIdentityProof()
    {
        var cases = new[]
        {
            """{"steps":[{"key":"future","stepId":"same"},{"key":"future","stepId":"same"}]}""",
            """{"steps":[{"key":"future","stepId":"actual","StepId":"ambiguous"}]}""",
            """{"steps":[{"key":"future","stepId":" padded "}]}""",
        };
        foreach (var text in cases)
        {
            try
            {
                var projection = ProgramSourceEditorProjection.Create(Read(text));
                var row = ((JArray)projection.DescribeStepIdentities(projection.EditorJson)["steps"]!).OfType<JObject>().Single();
                Assert.IsFalse(row.Value<bool>("sourceIdProven")); Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
                Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
            }
            catch (ProgramSourceException ex) { Assert.AreEqual("SOURCE_DOCUMENT_UNSUPPORTED", ex.Code); }
        }
    }

    [TestMethod]
    public void CandidateMoveToAnotherOwnedSurface_CannotBorrowTheOriginalSourceRow()
    {
        var raw = Read("""{"steps":[{"key":"future:root","stepId":"root-step"}],"variables":[],"subPrograms":[{"id":"child","name":"Child","kind":1,"steps":[],"variables":[]}]}""");
        var projection = ProgramSourceEditorProjection.Create(raw); var editor = Read(projection.EditorJson);
        var step = editor["steps"]![0]!; step.Remove(); ((JArray)editor["subPrograms"]![0]!["steps"]!).Add(step);
        var row = ((JArray)projection.DescribeStepIdentities(editor.ToString(Formatting.None))["steps"]!).OfType<JObject>().Single();
        Assert.AreEqual("sub-child", row.Value<string>("surface")); Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
        Assert.AreEqual("source-surface-changed", row.Value<string>("documentLocalIdentityDenialReason"));
        Assert.AreEqual(JTokenType.Null, row["sourceRowAnchor"]!.Type);
    }

    [TestMethod]
    public void TwoSavesAndReorder_RebaseTheExactAcknowledgedStepIdsAndPreserveUnknownNativeAndFileData()
    {
        Open(); var before = Inspect(); var managed = Managed(); var resources = Bytes().Where(p => p.Key.StartsWith("files/", StringComparison.Ordinal)).ToDictionary(p => p.Key, p => p.Value);
        var source = Source(); ((JObject)source["steps"]![0]!).Remove("stepId"); WriteSource(source); before = Inspect();
        var editor = Editor(before); var originalId = editor["steps"]![0]!.Value<string>("stepId")!;
        editor["steps"]![0]!["note"] = "first local save";
        ((JArray)editor["steps"]!).Add(Read("""{"stepId":"fresh-ui-id","stepRunnerKey":"future:new","inputParams":{},"outputParams":{},"ifSteps":[],"elseSteps":[],"note":"","disabled":false,"collapsed":false,"delayMs":0,"opaque":{"n":1e999,"nil":null}}"""));
        var firstRow = editor["steps"]![0]!; firstRow.Remove(); ((JArray)editor["steps"]!).Add(firstRow);
        var ack = editor.ToString(Formatting.None); var first = Save(before, ack); AssertEnvelope(first);
        Assert.AreEqual(ack, first.Value<string>("editorJson"));
        Assert.AreEqual("/steps/1", Row(first, originalId)["sourceRowAnchor"]!.Value<string>("path"));
        Assert.IsFalse(Row(first, originalId).Value<bool>("sourceIdProven"));
        var newer = Read(ack); newer["steps"]![1]!["note"] = "newer draft before the first ACK arrived";
        var second = Save(first, newer.ToString(Formatting.None)); AssertEnvelope(second);
        Assert.AreEqual("newer draft before the first ACK arrived", Editor(second)["steps"]![1]!.Value<string>("note"));
        Assert.IsNull(Source()["steps"]![1]!["stepId"]);
        Assert.AreEqual("qkrpc:actually-native", ActionSourceWorkspace.Prepare(directory).Body["Steps"]![1]!["IfSteps"]![0]!.Value<string>("StepId"));
        Assert.AreEqual("9223372036854775807", Source()["steps"]![1]!["Future"]!["integer"]!.ToString(Formatting.None));
        Assert.AreEqual("0.12345678901234567890123456789", Source()["steps"]![1]!["Future"]!["decimal"]!.ToString(Formatting.None));
        AssertEnvelope(Inspect()); AssertManaged(managed);
        foreach (var file in resources) CollectionAssert.AreEqual(file.Value, File.ReadAllBytes(PathOf(file.Key)), file.Key);
        AttachWire("inspect-idless.json", before); AttachWire("save-local.json", first); AttachWire("save-local-second.json", second);
    }

    [DataTestMethod]
    [DataRow("yaml")]
    [DataRow("resource")]
    [DataRow("identity")]
    [DataRow("baseline")]
    public void SourceAndManagedByteChanges_RetireTheWholeDescriptorAndRejectOldSnapshot(string changed)
    {
        Open(); var before = Inspect(); var relative = changed switch { "yaml" => ActionSourceWorkspace.SourceFile, "resource" => "files/source-1.txt", "identity" => ActionSourceWorkspace.IdentityFile, _ => ActionSourceWorkspace.BaselineFile };
        File.AppendAllText(PathOf(relative), changed == "yaml" ? "\n# external bytes\n" : changed == "resource" ? "later resource\n" : "\n", Utf8);
        var bytes = Bytes(); var after = Inspect(); AssertEnvelope(after);
        Assert.AreNotEqual(Identity(before).Value<string>("mappingEpoch"), Identity(after).Value<string>("mappingEpoch"));
        Assert.AreEqual("SOURCE_SNAPSHOT_CONFLICT", Assert.ThrowsException<ProgramSourceException>(() => Save(before, before.Value<string>("editorJson")!)).Code); AssertBytes(bytes);
    }

    [TestMethod]
    public void NoopSave_KeepsBomAndCrlfButBindsTheExactAcknowledgedEditorBytes()
    {
        Open(); var path = PathOf(ActionSourceWorkspace.SourceFile);
        var text = "# retained bytes\r\n" + File.ReadAllText(path).Replace("\r\n", "\n", StringComparison.Ordinal).Replace("\n", "\r\n", StringComparison.Ordinal);
        File.WriteAllBytes(path, new byte[] { 0xef, 0xbb, 0xbf }.Concat(Utf8.GetBytes(text)).ToArray());
        var bytes = Bytes(); var before = Inspect(); var ack = " \n" + before.Value<string>("editorJson") + "\r\n\t";
        var after = Save(before, ack); AssertEnvelope(after);
        Assert.AreEqual(Revision(before), Revision(after)); Assert.AreEqual(ack, after.Value<string>("editorJson"));
        Assert.AreNotEqual(Identity(before).Value<string>("mappingEpoch"), Identity(after).Value<string>("mappingEpoch")); AssertBytes(bytes);
    }

    private void Open(JObject? body = null) => ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", body ?? Native());
    private JObject Inspect() => ActionSourceWorkspace.Document(directory, "inspect", null, null, null, default);
    private JObject Save(JObject before, string editor) => ActionSourceWorkspace.Document(directory, "save-local", Revision(before), editor, null, default, before.Value<string>("editorJson"));
    private static JObject Read(string json) => LosslessProgramJson.ParseObject(json);
    private static string Revision(JObject document) => document["sourceSnapshot"]!.Value<string>("revision")!;
    private static JObject Identity(JObject document) => (JObject)document["stepIdentity"]!;
    private static JObject Editor(JObject document) => Read(document.Value<string>("editorJson")!);
    private static IEnumerable<JObject> Rows(JObject document) => ((JArray)Identity(document)["steps"]!).OfType<JObject>();
    private static JObject Row(JObject document, string id) => Rows(document).Single(row => row.Value<string>("editorId") == id);
    private static string Hash(string text) => "sha256:" + Convert.ToHexString(SHA256.HashData(Utf8.GetBytes(text))).ToLowerInvariant();
    private string PathOf(string relative) => Path.Combine(directory, relative.Replace('/', Path.DirectorySeparatorChar));
    private JObject Source() => ProgramSourceCodec.Decode(File.ReadAllText(PathOf(ActionSourceWorkspace.SourceFile)));
    private void WriteSource(JObject source) => File.WriteAllText(PathOf(ActionSourceWorkspace.SourceFile), ProgramSourceCodec.Encode(source), Utf8);
    private Dictionary<string, byte[]> Bytes() => Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).ToDictionary(path => Path.GetRelativePath(directory, path).Replace('\\', '/'), File.ReadAllBytes, StringComparer.Ordinal);
    private Dictionary<string, byte[]> Managed() => Bytes().Where(p => p.Key is ActionSourceWorkspace.IdentityFile or ActionSourceWorkspace.BaselineFile).ToDictionary(p => p.Key, p => p.Value);
    private void AssertManaged(Dictionary<string, byte[]> expected) { foreach (var pair in expected) CollectionAssert.AreEqual(pair.Value, File.ReadAllBytes(PathOf(pair.Key)), pair.Key); }
    private void AssertBytes(Dictionary<string, byte[]> expected)
    {
        var actual = Bytes(); CollectionAssert.AreEquivalent(expected.Keys.ToArray(), actual.Keys.ToArray());
        foreach (var pair in expected) CollectionAssert.AreEqual(pair.Value, actual[pair.Key], pair.Key);
    }
    private void AttachWire(string name, JObject document)
    {
        // Protocol evidence from the real codec is an owned test attachment, never a live/user bundle.
        var output = Path.Combine(TestContext.TestResultsDirectory!, "source-step-wire-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(output);
        var path = Path.Combine(output, name);
        using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        { var bytes = Utf8.GetBytes(document.ToString(Formatting.Indented)); file.Write(bytes); }
        TestContext.AddResultFile(path);
    }

    private void AssertEnvelope(JObject document, string view = "observed", string? baseline = null)
    {
        var descriptor = Identity(document);
        Assert.AreEqual(1, descriptor.Value<int>("schemaVersion")); Assert.IsFalse(descriptor.Value<bool>("authorizesLive"));
        Assert.AreEqual(view, descriptor.Value<string>("view")); Assert.AreEqual("source-codec-identity-only", descriptor.Value<string>("identityMappingScope"));
        Assert.AreEqual(Revision(document), descriptor.Value<string>("sourceSnapshot"));
        Assert.AreEqual(document["codec"]!.Value<string>("descriptorRevision"), descriptor.Value<string>("codecRevision"));
        Assert.AreEqual(document["sourceSnapshot"]!.Value<string>("codecRevision"), descriptor.Value<string>("codecRevision"));
        Assert.AreEqual(Hash(document.Value<string>("editorJson")!), descriptor.Value<string>("editorDocumentHash"));
        Assert.AreEqual(Hash(baseline ?? document.Value<string>("editorJson")!), descriptor.Value<string>("baselineEditorHash"));
        Assert.AreEqual("content-bound", descriptor.Value<string>("mappingEpochKind"));
        var unhashed = (JObject)descriptor.DeepClone(); unhashed.Remove("mappingEpoch");
        Assert.AreEqual(Hash(unhashed.ToString(Formatting.None)), descriptor.Value<string>("mappingEpoch"));
        if (view != "observed") return;
        var originals = new Dictionary<(string, string), JObject>();
        void Program(JObject source, JObject editor, string surface)
        {
            void Steps(JObject[] rows, string path) { for (var i = 0; i < rows.Length; i++) { var rowPath = path + "/" + i; originals.Add((surface, rowPath), rows[i]); Steps(Items(rows[i], "ifSteps"), rowPath + "/ifSteps"); Steps(Items(rows[i], "elseSteps"), rowPath + "/elseSteps"); } }
            Steps(Items(source, "steps"), "/steps");
            var subs = Items(source, "subPrograms"); var editorSubs = Items(editor, "subPrograms"); Assert.AreEqual(subs.Length, editorSubs.Length);
            for (var i = 0; i < subs.Length; i++) Program(subs[i], editorSubs[i], "sub-" + editorSubs[i].Value<string>("id"));
        }
        Program(Source(), Editor(document), "main");
        foreach (var row in Rows(document))
        {
            var anchor = (JObject)row["sourceRowAnchor"]!; Assert.AreEqual(row.Value<string>("surface"), anchor.Value<string>("surface"));
            Assert.AreEqual(Hash(originals[(anchor.Value<string>("surface")!, anchor.Value<string>("path")!)].ToString(Formatting.None)), anchor.Value<string>("rowHash"));
        }
    }
    private static JObject[] Items(JObject value, string key) => (value[key] as JArray ?? new JArray()).OfType<JObject>().ToArray();
    private static JObject Native() => Read("""
        {"Steps":[{"StepId":"s-1","StepRunnerKey":"sys:evalexpression","Note":"before","InputParams":{"expression":{"Value":"one\ntwo\nthree\nfour\nfive\n","VarKey":"","Future":{"n":9223372036854775807}}},"Future":{"integer":9223372036854775807,"decimal":0.12345678901234567890123456789,"nil":null,"empty":{}},"IfSteps":[{"StepId":"qkrpc:actually-native","StepRunnerKey":"future:nested","InputParams":{"value":{"Value":"literal","VarKey":""}}}]}],"Variables":[],"SubPrograms":[{"Id":"child","Name":"Child","Steps":[{"StepId":"child-step","StepRunnerKey":"future:child","Note":"child"}],"Variables":[]}],"FutureRoot":{"n":1e999,"nil":null}}
        """);
}
