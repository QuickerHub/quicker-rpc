using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Source;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionSourceDocumentTests
{
    private const string ActionId = "9b638790-d7b9-4f3d-ae44-e04e36177731";
    private string directory = string.Empty;

    [TestInitialize]
    public void Initialize()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "QuickerRpc/src/QuickerRpc.Console/ActionSourceWorkspace.cs"))) root = root.Parent;
        Assert.IsNotNull(root);
        directory = Path.Combine(root.FullName, ".tmp", "source-document-test-" + Guid.NewGuid().ToString("N"));
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", Native());
    }

    [TestCleanup]
    public void Cleanup()
    {
        if (!string.IsNullOrEmpty(directory) && Directory.Exists(directory)) Directory.Delete(directory, true);
    }

    private JObject Inspect() => ActionSourceWorkspace.Document(directory, "inspect", null, null, null, default);
    private static string Revision(JObject value) => value["sourceSnapshot"]!.Value<string>("revision")!;
    private JObject Save(JObject before, string editor, JArray? resources = null) => ActionSourceWorkspace.Document(directory,
        "save-local", Revision(before), editor, resources, default, before.Value<string>("editorJson"));
    private string PathOf(string relative) => Path.Combine(directory, relative.Replace('/', Path.DirectorySeparatorChar));
    private Dictionary<string, byte[]> Managed() => new[] { ActionSourceWorkspace.IdentityFile, ActionSourceWorkspace.BaselineFile }
        .ToDictionary(path => path, path => File.ReadAllBytes(PathOf(path)));
    private void AssertManaged(Dictionary<string, byte[]> expected)
    { foreach (var pair in expected) CollectionAssert.AreEqual(pair.Value, File.ReadAllBytes(PathOf(pair.Key))); }
    private static JObject Edit(JObject before, string note) { var editor = LosslessProgramJson.ParseObject(before.Value<string>("editorJson")!); editor["steps"]![0]!["note"] = note; return editor; }

    [TestMethod]
    public void Inspect_IsOfflineLosslessAndKeepsFileReferences()
    {
        var managed = Managed(); var source = File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile));
        var inspected = Inspect();
        StringAssert.Contains(inspected.Value<string>("editorJson"), "expression.file");
        StringAssert.Contains(inspected.Value<string>("editorJson"), "9007199254740993123456789");
        StringAssert.Contains(inspected.Value<string>("editorJson"), "0.12345678901234567890123456789");
        Assert.AreEqual("clean", inspected["pending"]!.Value<string>("status"));
        Assert.AreEqual("unobserved", inspected["pending"]!.Value<string>("nativeState"));
        Assert.AreEqual("unknown", inspected["codec"]!["nativeSource"]!.Value<string>("status"));
        Assert.IsFalse(inspected["capabilities"]!.Value<bool>("snapshotAuthorizesWrite"));
        Assert.IsTrue(inspected["sourceSnapshot"]!["files"]!.Any(item => item.Value<string>("path") == "files/source-1.txt"));
        CollectionAssert.AreEqual(source, File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile)));
        AssertManaged(managed);
    }

    [TestMethod]
    public void ResourceAndYamlEdits_ArePendingAcrossReopenEvenWithSameEditVersion()
    {
        var before = Inspect(); var managed = Managed();
        File.WriteAllText(PathOf("files/source-1.txt"), "late resource\r\n");
        var afterResource = Inspect();
        Assert.AreEqual("pending", afterResource["pending"]!.Value<string>("status"));
        Assert.AreEqual("7", afterResource.Value<string>("editVersion"));
        Assert.AreNotEqual(Revision(before), Revision(afterResource));
        var source = File.ReadAllText(PathOf(ActionSourceWorkspace.SourceFile));
        File.WriteAllText(PathOf(ActionSourceWorkspace.SourceFile), "# external change\n" + source);
        var reopened = Inspect();
        Assert.AreEqual("pending", reopened["pending"]!.Value<string>("status"));
        Assert.AreNotEqual(Revision(afterResource), Revision(reopened));
        AssertManaged(managed);
    }

    [TestMethod]
    public void NoOp_PreservesOriginalYamlBomCommentsAndCrlfBytes()
    {
        var path = PathOf(ActionSourceWorkspace.SourceFile);
        var text = "# human comment\r\n" + File.ReadAllText(path).Replace("\r\n", "\n").Replace("\n", "\r\n");
        File.WriteAllBytes(path, new byte[] { 0xef, 0xbb, 0xbf }.Concat(Encoding.UTF8.GetBytes(text)).ToArray());
        var original = File.ReadAllBytes(path); var managed = Managed(); var before = Inspect();
        var saved = Save(before, before.Value<string>("editorJson")!);
        CollectionAssert.AreEqual(original, File.ReadAllBytes(path));
        Assert.AreEqual(Revision(before), Revision(saved));
        Assert.AreEqual(0, ((JArray)saved["saveLocal"]!["writtenFiles"]!).Count);
        Assert.AreEqual("unchanged-original", saved["saveLocal"]!.Value<string>("normalization"));
        AssertManaged(managed);
    }

    [TestMethod]
    public void SaveLocal_OnlyWritesRequestedSourceAndResourceAndNeverAdvancesBaseline()
    {
        var before = Inspect(); var managed = Managed(); var editor = Edit(before, "local note");
        var resource = Encoding.UTF8.GetBytes("resource changed\r\n");
        var saved = Save(before, editor.ToString(), new JArray(new JObject
        { ["path"] = "files/source-1.txt", ["contentBase64"] = Convert.ToBase64String(resource) }));
        Assert.AreEqual("pending", saved["pending"]!.Value<string>("status"));
        Assert.AreEqual("7", saved.Value<string>("editVersion"));
        Assert.AreEqual(editor.ToString(), saved.Value<string>("editorJson"), "ACK preserves the submitted GUI identities and working document");
        Assert.AreEqual("codec-normalized", saved["saveLocal"]!.Value<string>("normalization"));
        Assert.IsFalse(saved["saveLocal"]!.Value<bool>("baselineAdvanced"));
        CollectionAssert.AreEqual(resource, File.ReadAllBytes(PathOf("files/source-1.txt")));
        AssertManaged(managed);
        Assert.AreEqual("pending", Inspect()["pending"]!.Value<string>("status"));
        Assert.AreEqual("local note", ActionSourceWorkspace.Prepare(directory).Body["Steps"]![0]!.Value<string>("Note"));
    }

    [TestMethod]
    public void Preview_IsSameCodecCompilationWithoutAnyFileWrites()
    {
        var before = Inspect(); var managed = Managed(); var source = File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile));
        var output = ActionSourceWorkspace.Document(directory, "preview", Revision(before), Edit(before, "preview").ToString(), null, default,
            before.Value<string>("editorJson"));
        Assert.AreEqual(Revision(before), Revision(output));
        StringAssert.Contains(output["preview"]!.Value<string>("sourceYaml"), "preview");
        Assert.AreEqual("pending", output["pending"]!.Value<string>("status"));
        CollectionAssert.AreEqual(source, File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile)));
        AssertManaged(managed);
    }

    [DataTestMethod]
    [DataRow("program.source.yaml")]
    [DataRow("files/source-1.txt")]
    [DataRow("quicker.source.json")]
    [DataRow(".qkrpc/baseline.json")]
    public void ExactByteCas_RejectsContentResourceOrSidecarChanges(string changed)
    {
        var before = Inspect(); var path = PathOf(changed);
        File.AppendAllText(path, changed.EndsWith("json", StringComparison.Ordinal) ? "\n " : "\n# external\n");
        var current = File.ReadAllBytes(path);
        var error = Assert.ThrowsException<ProgramSourceException>(() => Save(before, before.Value<string>("editorJson")!));
        Assert.AreEqual("SOURCE_SNAPSHOT_CONFLICT", error.Code);
        CollectionAssert.AreEqual(current, File.ReadAllBytes(path));
    }

    [TestMethod]
    public void CodecRevision_IsPartOfManagedCas()
    {
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var changedCodec = (JObject)prepared.Snapshot.Codec.DeepClone(); changedCodec["descriptorRevision"] = "sha256:other-loaded-codec";
        prepared = prepared with { Snapshot = prepared.Snapshot with { Codec = changedCodec } };
        Assert.AreEqual("SOURCE_SNAPSHOT_CONFLICT", Assert.ThrowsException<ProgramSourceException>(() => ActionSourceWorkspace.AssertManagedUnchanged(prepared)).Code);
    }

    [TestMethod]
    public void Checkpoint_UsesFrozenBodyAndLeavesLateSourceAndResourceEditsPending()
    {
        var before = Inspect(); Save(before, Edit(before, "body A").ToString());
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var current = Inspect(); Save(current, Edit(current, "body B").ToString());
        File.WriteAllText(PathOf("files/source-1.txt"), "late resource B");
        var lateSource = File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile));
        prepared.Body["Steps"]![0]!["Note"] = "mutating an exposed JObject cannot alter the consumed snapshot";
        ActionSourceWorkspace.Checkpoint(prepared, 8);
        var checkpoint = LosslessProgramJson.ParseObject(File.ReadAllText(PathOf(ActionSourceWorkspace.BaselineFile)));
        Assert.AreEqual("body A", checkpoint["body"]!["Steps"]![0]!.Value<string>("Note"));
        Assert.AreEqual("body B", ActionSourceWorkspace.Prepare(directory).Body["Steps"]![0]!.Value<string>("Note"));
        Assert.AreEqual("pending", Inspect()["pending"]!.Value<string>("status"));
        CollectionAssert.AreEqual(lateSource, File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile)));
        Assert.AreEqual(8, ActionSourceWorkspace.Prepare(directory).EditVersion);
    }

    [DataTestMethod]
    [DataRow("quicker.source.json")]
    [DataRow(".qkrpc/baseline.json")]
    public void Checkpoint_DoesNotOverwriteCompetingManagedIdentity(string relative)
    {
        var prepared = ActionSourceWorkspace.Prepare(directory);
        File.AppendAllText(PathOf(relative), "\n "); var after = Managed();
        Assert.AreEqual("SOURCE_SNAPSHOT_CONFLICT", Assert.ThrowsException<ProgramSourceException>(() => ActionSourceWorkspace.Checkpoint(prepared, 8)).Code);
        AssertManaged(after);
    }

    [TestMethod]
    public void ReadOnlyRootMetadataAndPreCancellation_DoNotWriteFiles()
    {
        var before = Inspect(); var managed = Managed(); var source = File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile));
        var editor = Edit(before, "note"); editor["unknownRoot"] = "forbidden";
        Assert.ThrowsException<ProgramSourceException>(() => Save(before, editor.ToString()));
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        Assert.ThrowsException<OperationCanceledException>(() => ActionSourceWorkspace.Document(directory, "save-local", Revision(before),
            before.Value<string>("editorJson"), null, cancelled.Token));
        CollectionAssert.AreEqual(source, File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile))); AssertManaged(managed);
    }

    [TestMethod]
    public void ExistingNativeVariableWithoutRealIdentity_RenameIsExplicitlyUnsupportedAndWritesNothing()
    {
        Directory.Delete(directory, true);
        var native = Native(); ((JObject)native["Variables"]![0]!).Remove("Id");
        ActionSourceWorkspace.Open(directory, ActionId, 7, "fixture", "catalog", native);
        var before = Inspect(); var managed = Managed(); var source = File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile));
        var editor = LosslessProgramJson.ParseObject(before.Value<string>("editorJson")!);
        editor["variables"]![0]!["key"] = "renamed";
        var error = Assert.ThrowsException<ProgramSourceException>(() => Save(before, editor.ToString()));
        Assert.AreEqual("SOURCE_DOCUMENT_UNSUPPORTED", error.Code);
        CollectionAssert.AreEqual(source, File.ReadAllBytes(PathOf(ActionSourceWorkspace.SourceFile))); AssertManaged(managed);
    }

    [TestMethod]
    public void AddedGuiStepWithEmptyMaps_AckRemainsAValidBaselineForSecondLocalSave()
    {
        var first = Inspect(); var editor = LosslessProgramJson.ParseObject(first.Value<string>("editorJson")!);
        ((JArray)editor["steps"]!).Add(new JObject
        { ["stepId"] = "new-gui-step", ["stepRunnerKey"] = "sys:comment", ["inputParams"] = new JObject(), ["outputParams"] = new JObject() });
        var saved = Save(first, editor.ToString());
        var second = LosslessProgramJson.ParseObject(saved.Value<string>("editorJson")!);
        second["steps"]![1]!["note"] = "second save after codec normalization";
        var savedAgain = ActionSourceWorkspace.Document(directory, "save-local", Revision(saved), second.ToString(), null, default,
            saved.Value<string>("editorJson"));
        Assert.AreEqual(second.ToString(), savedAgain.Value<string>("editorJson"));
        Assert.AreEqual("second save after codec normalization", ActionSourceWorkspace.Prepare(directory).Body["Steps"]![1]!.Value<string>("Note"));
    }

    [TestMethod]
    public void RawYamlOpaqueNullsAndSameNamedEmptyMaps_SurviveInspectAndUnrelatedSave()
    {
        var source = ProgramSourceCodec.Decode(File.ReadAllText(PathOf(ActionSourceWorkspace.SourceFile)));
        source["steps"]![0]!["future"] = new JObject
        {
            ["nil"] = JValue.CreateNull(), ["outputs"] = new JObject(),
            ["nested"] = new JArray(new JObject { ["inputs"] = new JObject(), ["nil"] = JValue.CreateNull() }),
        };
        // Emit raw source directly: invoking Encode here would hide a lossy Decode/Encode boundary.
        File.WriteAllText(PathOf(ActionSourceWorkspace.SourceFile), ProgramSourceYamlEmitter.Emit(source));
        var before = Inspect(); var editor = LosslessProgramJson.ParseObject(before.Value<string>("editorJson")!);
        Assert.IsTrue(JToken.DeepEquals(source["steps"]![0]!["future"], editor["steps"]![0]!["future"]));
        editor["steps"]![0]!["note"] = "unrelated edit";
        Save(before, editor.ToString());
        var reopened = LosslessProgramJson.ParseObject(Inspect().Value<string>("editorJson")!);
        Assert.IsTrue(JToken.DeepEquals(source["steps"]![0]!["future"], reopened["steps"]![0]!["future"]));
    }

    [TestMethod]
    public void GuiKnownEmptyMaps_DoNotRewriteExistingYamlBytesForAnUnchangedStep()
    {
        var path = PathOf(ActionSourceWorkspace.SourceFile);
        File.WriteAllText(path, "# preserve user comment\n" + File.ReadAllText(path));
        var original = File.ReadAllBytes(path); var before = Inspect();
        var editor = LosslessProgramJson.ParseObject(before.Value<string>("editorJson")!);
        editor["steps"]![0]!["outputParams"] = new JObject();
        editor["steps"]![0]!["disabled"] = false;
        editor["steps"]![0]!["note"] = "";
        var saved = Save(before, editor.ToString());
        Assert.AreEqual(0, ((JArray)saved["saveLocal"]!["writtenFiles"]!).Count);
        CollectionAssert.AreEqual(original, File.ReadAllBytes(path));
    }

    [TestMethod]
    public void CombinedResourceQuota_IsRejectedBeforePreviewOrAnyLocalWrites()
    {
        for (var i = 0; i < 2044; i++) File.WriteAllBytes(PathOf($"files/unused-{i}.bin"), Array.Empty<byte>());
        var before = Inspect(); var managed = Managed();
        var additions = new JArray(new JObject { ["path"] = "files/overflow.bin", ["contentBase64"] = "" });
        foreach (var mode in new[] { "preview", "save-local" })
        {
            var error = Assert.ThrowsException<ProgramSourceException>(() => ActionSourceWorkspace.Document(directory, mode,
                Revision(before), before.Value<string>("editorJson"), additions, default, before.Value<string>("editorJson")));
            Assert.AreEqual("SOURCE_DOCUMENT_TOO_LARGE", error.Code);
            Assert.IsFalse(File.Exists(PathOf("files/overflow.bin")));
            AssertManaged(managed);
        }
    }

    [TestMethod]
    public void LocalWriteFailureAfterResourceCommit_PreservesPartialReceiptWithoutAdvancingBaseline()
    {
        if (!OperatingSystem.IsWindows()) return; // Windows refuses replacing an existing readonly YAML file.
        var before = Inspect(); var managed = Managed(); var path = PathOf(ActionSourceWorkspace.SourceFile);
        var source = File.ReadAllBytes(path); File.SetAttributes(path, File.GetAttributes(path) | FileAttributes.ReadOnly);
        try
        {
            var error = Assert.ThrowsException<SourceDocumentWriteException>(() => Save(before, Edit(before, "cannot replace readonly source").ToString(),
                new JArray(new JObject { ["path"] = "files/source-1.txt", ["contentBase64"] = Convert.ToBase64String(Encoding.UTF8.GetBytes("committed resource")) })));
            CollectionAssert.AreEqual(new[] { "files/source-1.txt" }, error.WrittenFiles);
            Assert.AreEqual("program.source.yaml", error.FailedFile);
            Assert.AreEqual("committed resource", File.ReadAllText(PathOf("files/source-1.txt")));
            CollectionAssert.AreEqual(source, File.ReadAllBytes(path)); AssertManaged(managed);
        }
        finally { File.SetAttributes(path, File.GetAttributes(path) & ~FileAttributes.ReadOnly); }
    }

    private static JObject Native() => LosslessProgramJson.ParseObject("""
    {"Steps":[{"StepRunnerKey":"sys:evalexpression","StepId":"first","InputParams":{"expression":{"Value":"line1\r\nline2\r\nline3\r\nline4\r\nline5\r\n","VarKey":"","unknownBinding":true}},"unknownStep":{"integer":9007199254740993123456789,"decimal":0.12345678901234567890123456789}}],
    "Variables":[{"Id":"original-native-variable-id","Key":"message","Type":0,"DefaultValue":"","unknownVariable":null}],
    "SubPrograms":[],"unknownRoot":{"keep":true}}
    """);
}
