using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class SourceVariableIdentityDocumentTests
{
    private const string ActionId = "9b638790-d7b9-4f3d-ae44-e04e36177731";
    private string directory = string.Empty;
    private static readonly UTF8Encoding Utf8 = new(false, true);

    [TestInitialize]
    public void Initialize()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "QuickerRpc/src/QuickerRpc.Console/ActionSourceWorkspace.cs"))) root = root.Parent;
        Assert.IsNotNull(root);
        directory = Path.Combine(root.FullName, ".tmp", "source-variable-identity-document-test-" + Guid.NewGuid().ToString("N"));
    }

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [TestMethod]
    public void Inspect_BindsExactSnapshotCodecAndEditorText_AndKeepsRealVPrefixIds()
    {
        Open(Native("""[{"Id":"v-1","Key":"root","Type":0,"DefaultValue":""}]""",
            """[{"Id":"child","Name":"Child","Steps":[],"Variables":[{"Id":"v-1","Key":"local","Type":0,"DefaultValue":""}]}]"""));
        var bytes = Bytes();
        var document = Inspect();
        AssertEnvelope(document, "observed");
        foreach (var surface in new[] { "main", "sub-child" })
        {
            var row = Row(document, surface, "v-1");
            Assert.AreEqual("source", row.Value<string>("provenance"));
            Assert.AreEqual("v-1", row.Value<string>("sourceId"));
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            Assert.AreEqual("v-1", row.Value<string>("nativeCheckpointId"));
            Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
            Assert.IsTrue(row.Value<bool>("ownedSurface"));
            Assert.IsFalse(row.Value<bool>("hasSyntheticAncestor"));
            Assert.IsTrue(row.Value<bool>("stableIdentityProven"));
            Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
            Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
            Assert.IsTrue(row.Value<bool>("renameMappingProven"));
            Assert.AreEqual("native-id", row.Value<string>("renameMappingBasis"));
            Assert.AreEqual(JTokenType.Null, row["identityDenialReason"]!.Type);
            Assert.AreEqual(JTokenType.Null, row["renameMappingDenialReason"]!.Type);
        }
        AssertBytes(bytes);
    }

    [TestMethod]
    public void IdlessCurrentSource_UsesActualNativeCheckpointProof_WithoutGuessingFromItsSpelling()
    {
        Open(Native("""[{"Id":"v-1","Key":"root","Type":0,"DefaultValue":""}]"""));
        var source = Source(); ((JObject)source["variables"]![0]!).Remove("id"); WriteSource(source);
        var document = Inspect();
        AssertEnvelope(document, "observed");
        var row = Row(document, "main", "v-1");
        Assert.AreEqual("native-checkpoint", row.Value<string>("provenance"));
        Assert.AreEqual(JTokenType.Null, row["sourceId"]!.Type);
        Assert.IsFalse(row.Value<bool>("sourceIdProven"));
        Assert.AreEqual("v-1", row.Value<string>("nativeCheckpointId"));
        Assert.IsTrue(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.IsTrue(row.Value<bool>("stableIdentityProven"));
        Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
        Assert.AreEqual("checkpoint-proven", row.Value<string>("nativeIdentity"));
        Assert.IsTrue(row.Value<bool>("renameMappingProven"));
        Assert.AreEqual("native-id", row.Value<string>("renameMappingBasis"));
    }

    [TestMethod]
    public void ASourceOnlyIdentity_IsNotReportedAsAProvenNativeRenameMapping()
    {
        Open(Native("""[{"Key":"root","Type":0,"DefaultValue":""}]"""));
        var source = Source(); source["variables"]![0]!["id"] = "source-only"; WriteSource(source);
        var document = Inspect();
        AssertEnvelope(document, "observed");
        var row = Row(document, "main", "source-only");
        Assert.AreEqual("source", row.Value<string>("provenance"));
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        Assert.IsTrue(row.Value<bool>("stableIdentityProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        Assert.AreEqual(JTokenType.Null, row["nativeCheckpointId"]!.Type);
        Assert.IsFalse(row.Value<bool>("renameMappingProven"));
        Assert.AreEqual("native-mapping-unproven", row.Value<string>("renameMappingDenialReason"));
        Assert.AreEqual("unproven", row.Value<string>("renameMappingBasis"));
    }

    [TestMethod]
    public void ACheckpointSourceIdAndTheActualIdlessNativeKey_ProveOnlyTheCodecRenameBridge()
    {
        Open(Native("""[{"Key":"root","Type":0,"DefaultValue":"","future":{"nil":null,"n":9223372036854775807}}]"""));
        var source = Source(); source["variables"]![0]!["id"] = "checkpoint-source"; WriteSource(source);
        var baseline = LosslessProgramJson.ParseObject(File.ReadAllText(PathOf(ActionSourceWorkspace.BaselineFile)));
        var caw = (JObject)baseline["caw"]!;
        caw["variables"]![0]!["id"] = "checkpoint-source";
        baseline["cawHash"] = Convert.ToHexString(SHA256.HashData(Utf8.GetBytes(caw.ToString(Formatting.None))));
        File.WriteAllText(PathOf(ActionSourceWorkspace.BaselineFile), baseline.ToString(Formatting.Indented) + "\n", Utf8);
        var bytes = Bytes();
        var document = Inspect();
        AssertEnvelope(document, "observed");
        var row = Row(document, "main", "checkpoint-source");
        Assert.IsTrue(row.Value<bool>("sourceIdProven"));
        Assert.IsTrue(row.Value<bool>("stableIdentityProven"));
        Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
        Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
        Assert.AreEqual(JTokenType.Null, row["nativeCheckpointId"]!.Type);
        Assert.IsTrue(row.Value<bool>("renameMappingProven"));
        Assert.AreEqual("checkpoint-source-id-and-native-key", row.Value<string>("renameMappingBasis"));
        Assert.AreEqual(JTokenType.Null, row["renameMappingDenialReason"]!.Type);
        AssertBytes(bytes);
    }

    [TestMethod]
    public void GeneratedRows_StayAlignedWithExactAckIdsAcrossTwoSavesReorderingAndAdditions()
    {
        Open(Native("""[{"Key":"first","Type":0,"DefaultValue":""},{"Key":"second","Type":0,"DefaultValue":""}]"""));
        var managed = Managed();
        var before = Inspect();
        AssertGenerated(before);
        var editor = Editor(before);
        var rows = (JArray)editor["variables"]!;
        rows.ReplaceAll(new object[] { rows[1]!.DeepClone(), rows[0]!.DeepClone(),
            LosslessProgramJson.ParseObject("""{"id":"ui-added-opaque","key":"third","varType":"text","default":""}""") });
        var firstAck = " \n" + editor.ToString(Formatting.None) + "\r\n";
        var first = Save(before, firstAck);
        Assert.AreEqual(firstAck, first.Value<string>("editorJson"));
        AssertEnvelope(first, "observed"); AssertGenerated(first);
        Row(first, "main", "ui-added-opaque");

        var secondEditor = Editor(first);
        var secondRows = (JArray)secondEditor["variables"]!;
        secondRows.ReplaceAll(new object[] { secondRows[2]!.DeepClone(), secondRows[0]!.DeepClone(), secondRows[1]!.DeepClone(),
            LosslessProgramJson.ParseObject("""{"id":"v-999999999999","key":"fourth","varType":"text","default":""}""") });
        secondRows[0]!["desc"] = "second local save";
        var secondAck = secondEditor.ToString(Formatting.Indented) + "\n";
        var second = Save(first, secondAck);
        Assert.AreEqual(secondAck, second.Value<string>("editorJson"));
        AssertEnvelope(second, "observed"); AssertGenerated(second);
        Assert.AreNotEqual(Identity(before).Value<string>("mappingEpoch"), Identity(first).Value<string>("mappingEpoch"));
        Assert.AreNotEqual(Identity(first).Value<string>("mappingEpoch"), Identity(second).Value<string>("mappingEpoch"));
        Row(second, "main", "ui-added-opaque"); Row(second, "main", "v-999999999999");
        Assert.IsTrue(((JArray)Source()["variables"]!).OfType<JObject>().All(row => row.Property("id") is null && row.Property("Id") is null));
        var reopened = Inspect(); AssertEnvelope(reopened, "observed"); AssertGenerated(reopened);
        AssertManaged(managed);
    }

    [DataTestMethod]
    [DataRow("yaml")]
    [DataRow("resource")]
    [DataRow("identity")]
    [DataRow("baseline")]
    public void ExternalByteChanges_InvalidateTheOldDescriptorEvenWithoutAnEditVersionChange(string changed)
    {
        Open();
        var before = Inspect();
        var relative = changed switch { "yaml" => ActionSourceWorkspace.SourceFile, "resource" => "files/source-1.txt",
            "identity" => ActionSourceWorkspace.IdentityFile, _ => ActionSourceWorkspace.BaselineFile };
        File.AppendAllText(PathOf(relative), changed == "yaml" ? "\n# external byte edit\n" : changed == "resource" ? "late text\n" : "\n", Utf8);
        var afterExternalChange = Bytes();
        var after = Inspect();
        AssertEnvelope(after, "observed");
        Assert.AreEqual(before.Value<string>("editVersion"), after.Value<string>("editVersion"));
        Assert.AreNotEqual(Revision(before), Revision(after));
        Assert.AreNotEqual(Identity(before).Value<string>("sourceSnapshot"), Identity(after).Value<string>("sourceSnapshot"));
        Assert.AreEqual("SOURCE_SNAPSHOT_CONFLICT", Assert.ThrowsException<ProgramSourceException>(() => Save(before, before.Value<string>("editorJson")!)).Code);
        AssertBytes(afterExternalChange);
    }

    [TestMethod]
    public void PreviewIsCandidate_AndNewRowsCannotBorrowObservedSourceOrNativeProof()
    {
        Open(Native("""[{"Id":"native-real","Key":"root","Type":0,"DefaultValue":""}]"""));
        var before = Inspect(); var bytes = Bytes(); var editor = Editor(before);
        ((JArray)editor["variables"]!).Add(LosslessProgramJson.ParseObject("""{"id":"pretend-real-id","key":"candidate","varType":"text","default":""}"""));
        var ack = editor.ToString(Formatting.None) + "\r\n";
        var preview = ActionSourceWorkspace.Document(directory, "preview", Revision(before), ack, null, default, before.Value<string>("editorJson"));
        AssertEnvelope(preview, "candidate", before.Value<string>("editorJson"));
        Assert.AreEqual(Revision(before), Revision(preview));
        foreach (var row in Rows(preview))
        {
            Assert.IsFalse(row.Value<bool>("stableIdentityProven"));
            Assert.IsFalse(row.Value<bool>("renameMappingProven"));
            Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
            Assert.AreEqual("candidate-preview", row.Value<string>("identityDenialReason"));
            Assert.AreEqual("candidate-preview", row.Value<string>("renameMappingDenialReason"));
            Assert.AreEqual("candidate-preview", row.Value<string>("documentLocalIdentityDenialReason"));
        }
        var added = Row(preview, "main", "pretend-real-id");
        Assert.AreEqual("generated", added.Value<string>("provenance"));
        Assert.AreEqual(JTokenType.Null, added["sourceRowAnchor"]!.Type);
        Assert.IsFalse(added.Value<bool>("sourceIdProven")); Assert.IsFalse(added.Value<bool>("nativeCheckpointIdProven"));
        AssertBytes(bytes);
        Assert.IsTrue(Row(Inspect(), "main", "native-real").Value<bool>("stableIdentityProven"));
    }

    [TestMethod]
    public void SyntheticProgramAncestor_DeniesItsOwnAndRealDescendantVariableIdentities()
    {
        Open(Native("""[{"Id":"root-real","Key":"root","Type":0,"DefaultValue":""}]""",
            """[{"Id":"parent","Name":"Parent","Steps":[],"Variables":[{"Id":"child-variable","Key":"local","Type":0,"DefaultValue":""}],"SubPrograms":[{"Id":"real-grandchild","Name":"Grandchild","Steps":[],"Variables":[{"Id":"grand-variable","Key":"local","Type":0,"DefaultValue":""}]}]}]"""));
        var source = Source(); ((JObject)source["subPrograms"]![0]!).Remove("id"); WriteSource(source);
        var document = Inspect(); AssertEnvelope(document, "observed");
        Assert.IsTrue(Row(document, "main", "root-real").Value<bool>("stableIdentityProven"));
        foreach (var row in Rows(document).Where(row => row.Value<string>("surface") != "main"))
        {
            Assert.IsTrue(row.Value<bool>("sourceIdProven"));
            Assert.IsTrue(row.Value<bool>("ownedSurface"));
            Assert.IsTrue(row.Value<bool>("hasSyntheticAncestor"));
            Assert.IsTrue(((JArray)row["ancestors"]!).Any(ancestor => ancestor.Value<bool>("synthetic")));
            Assert.IsFalse(row.Value<bool>("stableIdentityProven")); Assert.IsFalse(row.Value<bool>("renameMappingProven"));
            Assert.IsFalse(row.Value<bool>("documentLocalIdentityProven"));
            Assert.AreEqual("synthetic-surface-ancestor", row.Value<string>("identityDenialReason"));
            Assert.AreEqual("synthetic-surface-ancestor", row.Value<string>("renameMappingDenialReason"));
            Assert.AreEqual("synthetic-surface-ancestor", row.Value<string>("documentLocalIdentityDenialReason"));
        }
    }

    [TestMethod]
    public void MutatingReturnedDescriptor_CannotChangeTheNextInspectionOrItsProofs()
    {
        Open(Native("""[{"Key":"root","Type":0,"DefaultValue":""}]"""));
        var before = Inspect(); var expected = Identity(before).DeepClone(); var bytes = Bytes();
        Identity(before)["sourceSnapshot"] = "sha256:forged"; Identity(before)["codecRevision"] = "sha256:forged";
        Identity(before)["authorizesLive"] = true;
        var row = Rows(before).Single(); row["sourceId"] = "forged"; row["sourceIdProven"] = true;
        row["stableIdentityProven"] = true; row["renameMappingProven"] = true; row["provenance"] = "source";
        var after = Inspect();
        Assert.IsTrue(JToken.DeepEquals(expected, Identity(after)));
        AssertEnvelope(after, "observed"); AssertGenerated(after); AssertBytes(bytes);
    }

    [TestMethod]
    public void Noop_KeepsOriginalBytesWhileDescriptorHashesTheExactAcknowledgedJsonText()
    {
        Open();
        var sourcePath = PathOf(ActionSourceWorkspace.SourceFile);
        var text = "# retained bytes\r\n" + File.ReadAllText(sourcePath).Replace("\r\n", "\n", StringComparison.Ordinal).Replace("\n", "\r\n", StringComparison.Ordinal);
        File.WriteAllBytes(sourcePath, new byte[] { 0xef, 0xbb, 0xbf }.Concat(Utf8.GetBytes(text)).ToArray());
        var bytes = Bytes(); var before = Inspect();
        var ack = " \n" + before.Value<string>("editorJson")! + "\r\n\t";
        var after = Save(before, ack);
        AssertEnvelope(after, "observed"); Assert.AreEqual(ack, after.Value<string>("editorJson"));
        Assert.AreEqual(Revision(before), Revision(after));
        Assert.AreNotEqual(Identity(before).Value<string>("editorDocumentHash"), Identity(after).Value<string>("editorDocumentHash"));
        Assert.AreNotEqual(Identity(before).Value<string>("mappingEpoch"), Identity(after).Value<string>("mappingEpoch"));
        Assert.AreEqual(0, ((JArray)after["saveLocal"]!["writtenFiles"]!).Count);
        AssertBytes(bytes);
    }

    [TestMethod]
    public void NativeIdentityPromotionThatBreaksAckContinuity_IsRejectedBeforeAnySourceOrResourceWrite()
    {
        Open(Native("""[{"Id":"n","Key":"root","Type":0,"DefaultValue":""}]"""));
        var source = Source(); ((JObject)source["variables"]![0]!).Remove("id"); WriteSource(source);
        var before = Inspect(); var bytes = Bytes();
        var baseline = Editor(before); baseline["variables"]![0]!["id"] = "ui-x";
        var editor = (JObject)baseline.DeepClone(); editor["variables"]![0]!["key"] = "renamed";
        var resources = new JArray(new JObject { ["path"] = "files/source-1.txt", ["contentBase64"] = Convert.ToBase64String(Utf8.GetBytes("must not be written\n")) });
        var failure = Assert.ThrowsException<ProgramSourceException>(() => ActionSourceWorkspace.Document(directory, "save-local",
            Revision(before), editor.ToString(Formatting.None), resources, default, baseline.ToString(Formatting.None)));
        Assert.AreEqual("SOURCE_DOCUMENT_UNSUPPORTED", failure.Code);
        AssertBytes(bytes);
        Assert.AreEqual(Revision(before), Revision(Inspect()));
    }

    private void Open(JObject? native = null) => ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", native ?? Native());
    private JObject Inspect() => ActionSourceWorkspace.Document(directory, "inspect", null, null, null, default);
    private JObject Save(JObject before, string editor) => ActionSourceWorkspace.Document(directory, "save-local", Revision(before), editor, null, default, before.Value<string>("editorJson"));
    private static string Revision(JObject document) => document["sourceSnapshot"]!.Value<string>("revision")!;
    private static JObject Identity(JObject document) { Assert.IsInstanceOfType<JObject>(document["variableIdentity"]); return (JObject)document["variableIdentity"]!; }
    private static JObject Editor(JObject document) => LosslessProgramJson.ParseObject(document.Value<string>("editorJson")!);
    private static IEnumerable<JObject> Rows(JObject document) => ((JArray)Identity(document)["variables"]!).OfType<JObject>();
    private static JObject Row(JObject document, string surface, string id) => Rows(document).Single(row => row.Value<string>("surface") == surface && row.Value<string>("editorId") == id);
    private static string Hash(string text) => "sha256:" + Convert.ToHexString(SHA256.HashData(Utf8.GetBytes(text))).ToLowerInvariant();
    private string PathOf(string relative) => Path.Combine(directory, relative.Replace('/', Path.DirectorySeparatorChar));
    private JObject Source() => ProgramSourceCodec.Decode(File.ReadAllText(PathOf(ActionSourceWorkspace.SourceFile)));
    private void WriteSource(JObject source) => File.WriteAllText(PathOf(ActionSourceWorkspace.SourceFile), ProgramSourceCodec.Encode(source), Utf8);
    private Dictionary<string, byte[]> Bytes() => Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)
        .ToDictionary(path => Path.GetRelativePath(directory, path).Replace('\\', '/'), File.ReadAllBytes, StringComparer.Ordinal);
    private Dictionary<string, byte[]> Managed() => Bytes().Where(pair => pair.Key is ActionSourceWorkspace.IdentityFile or ActionSourceWorkspace.BaselineFile).ToDictionary(pair => pair.Key, pair => pair.Value);
    private void AssertManaged(Dictionary<string, byte[]> expected) { foreach (var pair in expected) CollectionAssert.AreEqual(pair.Value, File.ReadAllBytes(PathOf(pair.Key)), pair.Key); }
    private void AssertBytes(Dictionary<string, byte[]> expected)
    {
        var actual = Bytes(); CollectionAssert.AreEquivalent(expected.Keys.ToArray(), actual.Keys.ToArray());
        foreach (var pair in expected) CollectionAssert.AreEqual(pair.Value, actual[pair.Key], pair.Key);
    }

    private void AssertEnvelope(JObject document, string view, string? baselineEditorJson = null)
    {
        var descriptor = Identity(document);
        Assert.AreEqual(1, descriptor.Value<int>("schemaVersion"));
        Assert.AreEqual(Revision(document), descriptor.Value<string>("sourceSnapshot"));
        Assert.AreEqual(document["sourceSnapshot"]!.Value<string>("codecRevision"), descriptor.Value<string>("codecRevision"));
        Assert.AreEqual(document["codec"]!.Value<string>("descriptorRevision"), descriptor.Value<string>("codecRevision"));
        Assert.AreEqual(Hash(document.Value<string>("editorJson")!), descriptor.Value<string>("editorDocumentHash"));
        Assert.AreEqual(Hash(baselineEditorJson ?? document.Value<string>("editorJson")!), descriptor.Value<string>("baselineEditorHash"));
        Assert.IsTrue(descriptor.Value<string>("mappingEpoch")?.StartsWith("sha256:", StringComparison.Ordinal) == true);
        Assert.AreEqual(71, descriptor.Value<string>("mappingEpoch")!.Length);
        Assert.AreEqual("source-codec-identity-only", descriptor.Value<string>("renameMappingScope"));
        Assert.IsFalse(descriptor.Value<bool>("authorizesLive")); Assert.AreEqual(view, descriptor.Value<string>("view"));
        var actual = Rows(document).Select(row => row.Value<string>("surface") + "\0" + row.Value<string>("editorId")).ToArray();
        var expected = new List<string>();
        void Visit(JObject program, string surface)
        {
            foreach (var variable in ((JArray?)program["variables"] ?? new JArray()).OfType<JObject>()) expected.Add(surface + "\0" + variable.Value<string>("id"));
            foreach (var child in ((JArray?)program["subPrograms"] ?? new JArray()).OfType<JObject>()) Visit(child, "sub-" + child.Value<string>("id"));
        }
        Visit(Editor(document), "main");
        Assert.AreEqual(actual.Length, actual.Distinct(StringComparer.Ordinal).Count());
        CollectionAssert.AreEquivalent(expected.ToArray(), actual);
        if (view == "observed")
        {
            var anchors = new Dictionary<(string Surface, string Key), JObject>();
            void WalkSource(JObject source, JObject editor, string surface)
            {
                foreach (var row in ((JArray?)source["variables"] ?? new JArray()).OfType<JObject>()) anchors.Add((surface, row.Value<string>("key")!), row);
                var sourceChildren = ((JArray?)source["subPrograms"] ?? new JArray()).OfType<JObject>().ToArray();
                var editorChildren = ((JArray?)editor["subPrograms"] ?? new JArray()).OfType<JObject>().ToArray();
                Assert.AreEqual(sourceChildren.Length, editorChildren.Length);
                for (var i = 0; i < sourceChildren.Length; i++) WalkSource(sourceChildren[i], editorChildren[i], "sub-" + editorChildren[i].Value<string>("id"));
            }
            var editor = Editor(document); WalkSource(Source(), editor, "main");
            foreach (var row in Rows(document))
            {
                Assert.IsInstanceOfType<JObject>(row["sourceRowAnchor"]);
                var anchor = (JObject)row["sourceRowAnchor"]!;
                Assert.AreEqual(row.Value<string>("surface"), anchor.Value<string>("surface"));
                var sourceRow = anchors[(anchor.Value<string>("surface")!, anchor.Value<string>("key")!)];
                Assert.AreEqual(Hash(sourceRow.ToString(Formatting.None)), anchor.Value<string>("rowHash"));
            }
        }
    }

    private static void AssertGenerated(JObject document)
    {
        foreach (var row in Rows(document))
        {
            Assert.AreEqual("generated", row.Value<string>("provenance"));
            Assert.IsFalse(row.Value<bool>("sourceIdProven")); Assert.IsFalse(row.Value<bool>("nativeCheckpointIdProven"));
            Assert.IsFalse(row.Value<bool>("stableIdentityProven")); Assert.IsFalse(row.Value<bool>("renameMappingProven"));
            Assert.IsTrue(row.Value<bool>("documentLocalIdentityProven"));
            Assert.AreEqual(JTokenType.Null, row["documentLocalIdentityDenialReason"]!.Type);
            Assert.AreEqual("unknown", row.Value<string>("nativeIdentity"));
            Assert.AreEqual("generated-editor-id", row.Value<string>("identityDenialReason"));
            Assert.AreEqual("generated-editor-id", row.Value<string>("renameMappingDenialReason"));
            Assert.AreEqual("unproven", row.Value<string>("renameMappingBasis"));
        }
    }

    private static JObject Native(string variables = """[{"Id":"native-real","Key":"root","Type":0,"DefaultValue":""}]""", string subPrograms = "[]") =>
        LosslessProgramJson.ParseObject("""
        {"Steps":[{"StepRunnerKey":"sys:evalexpression","StepId":"first","InputParams":{"expression":{"Value":"one\ntwo\nthree\nfour\nfive\n","VarKey":""}}}],
        "Variables":
        """ + variables + ",\"SubPrograms\":" + subPrograms + "}");
}
