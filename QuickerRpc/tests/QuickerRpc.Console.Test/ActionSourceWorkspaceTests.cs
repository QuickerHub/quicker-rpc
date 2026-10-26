using QuickerRpc.Testing;
using QuickerRpc.Transport;
using StreamJsonRpc;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using Formatting = Newtonsoft.Json.Formatting;
using QuickerRpc.AgentModel.XAction.Source;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionSourceWorkspaceTests
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "qkrpc-source-test-" + Guid.NewGuid().ToString("N"));
    private const string ActionId = "9b638790-d7b9-4f3d-ae44-e04e36177731";
    private const string Script = "line1\r\nline2\r\nline3\r\nline4\r\nline5\r\n";

    [TestCleanup]
    public void Cleanup()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }

    [TestMethod]
    public void OpenPrepare_PreservesNativeDataAndExternalFileBytes()
    {
        var native = Native();
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", native);
        Assert.AreEqual(Script, File.ReadAllText(Path.Combine(_directory, "files/source-1.txt")));
        var prepared = ActionSourceWorkspace.Prepare(_directory);
        Assert.IsTrue(JToken.DeepEquals(native, prepared.Body), prepared.Body.ToString());
        Assert.AreEqual(7, prepared.EditVersion);
        Assert.AreEqual(ActionId, prepared.ActionId);
    }

    [TestMethod]
    public void ResourceEdit_ChangesOnlyRequestedValue()
    {
        var native = Native();
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", native);
        File.WriteAllText(Path.Combine(_directory, "files/source-1.txt"), "new script\n");
        var prepared = ActionSourceWorkspace.Prepare(_directory);
        var expected = (JObject)native.DeepClone();
        expected["Steps"]![0]!["InputParams"]!["expression"]!["Value"] = "new script\n";
        Assert.IsTrue(JToken.DeepEquals(expected, prepared.Body), prepared.Body.ToString());
    }

    [TestMethod]
    public void Open_RefusesExistingLocalEdits()
    {
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", Native());
        var source = Path.Combine(_directory, ActionSourceWorkspace.SourceFile);
        File.WriteAllText(source, "local unsaved edits");
        Assert.ThrowsException<InvalidOperationException>(() =>
            ActionSourceWorkspace.Open(_directory, ActionId, 8, "fixture", "catalog", Native()));
        Assert.AreEqual("local unsaved edits", File.ReadAllText(source));
    }

    [TestMethod]
    public async Task DryRun_WorksWithoutRpcAndDoesNotRewriteYamlOrCheckpoint()
    {
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", Native());
        var sourcePath = Path.Combine(_directory, ActionSourceWorkspace.SourceFile);
        var source = "# keep this comment\n" + File.ReadAllText(sourcePath);
        File.WriteAllText(sourcePath, source);
        var checkpointPath = Path.Combine(_directory, ActionSourceWorkspace.BaselineFile);
        var checkpoint = File.ReadAllText(checkpointPath);
        var response = await ActionSourceServeOps.SaveAsync(null, Args(true), CancellationToken.None);
        Assert.IsTrue(response.Ok, response.Message);
        Assert.AreEqual(source, File.ReadAllText(sourcePath));
        Assert.AreEqual(checkpoint, File.ReadAllText(checkpointPath));
    }

    [TestMethod]
    public async Task Save_AdvancesVersionOnlyAfterHostSuccess()
    {
        await using var host = new FakeBindingHost();
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", Native(), hostBinding: host.Binding);
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        var rpc = session.Rpc;
        var versions = new List<long?>();
        host.Apply = (id, version) =>
        {
            Assert.AreEqual(ActionId, id);
            versions.Add(version);
            return new QuickerRpcApplyXActionResult
            { Success = true, Persisted = true, ActionId = ActionId, EditVersion = versions.Count + 7 };
        };
        var first = await ActionSourceServeOps.SaveAsync(rpc, Args(false), CancellationToken.None);
        Assert.IsTrue(first.Ok, first.Error + ": " + first.Message);
        Assert.IsTrue((await ActionSourceServeOps.SaveAsync(rpc, Args(false), CancellationToken.None)).Ok);
        CollectionAssert.AreEqual(new long?[] { 7, 8 }, versions);

        host.Apply = (_, _) => new QuickerRpcApplyXActionResult
        { Success = false, ErrorCode = "EDIT_VERSION_CONFLICT", VersionConflict = true };
        Assert.IsFalse((await ActionSourceServeOps.SaveAsync(rpc, Args(false), CancellationToken.None)).Ok);
        Assert.AreEqual(9, ActionSourceWorkspace.Prepare(_directory).EditVersion);
    }

    [TestMethod]
    public async Task InvalidFilesAndIdentity_AreRejectedBeforeRpc()
    {
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", Native());
        var sourcePath = Path.Combine(_directory, ActionSourceWorkspace.SourceFile);
        var source = File.ReadAllText(sourcePath);
        foreach (var reference in new[] { "files/../../outside.txt", "C:/outside.txt", "files/missing.txt" })
        {
            File.WriteAllText(sourcePath, source.Replace("files/source-1.txt", reference));
            Assert.IsFalse((await ActionSourceServeOps.SaveAsync(null, Args(true), CancellationToken.None)).Ok);
        }
        File.WriteAllText(sourcePath, source);
        var identityPath = Path.Combine(_directory, ActionSourceWorkspace.IdentityFile);
        var identity = JObject.Parse(File.ReadAllText(identityPath));
        identity["actionId"] = Guid.NewGuid().ToString();
        File.WriteAllText(identityPath, identity.ToString());
        Assert.IsFalse((await ActionSourceServeOps.SaveAsync(null, Args(true), CancellationToken.None)).Ok);
    }

    [TestMethod]
    public void Checkpoint_KeepsIdlessStepMetadataAcrossTwoEdits()
    {
        var native = Native();
        ((JObject)native["Steps"]![0]!).Remove("StepId");
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", native);
        var sourcePath = Path.Combine(_directory, "files/source-1.txt");
        File.WriteAllText(sourcePath, "first edit");
        var first = ActionSourceWorkspace.Prepare(_directory);
        ActionSourceWorkspace.Checkpoint(first, 8);
        File.WriteAllText(sourcePath, "second edit");
        var second = ActionSourceWorkspace.Prepare(_directory);
        var parameter = second.Body["Steps"]![0]!["InputParams"]!["expression"]!;
        Assert.AreEqual("second edit", parameter.Value<string>("Value"));
        Assert.AreEqual("keep", parameter.Value<string>("FutureParam"));
        Assert.IsNull(second.Body["Steps"]![0]!["StepId"]);
    }

    [TestMethod]
    public void Checkpoint_PreservesIsoLookingStringsWithoutChangingHash()
    {
        var native = Native();
        native["FutureRoot"]!["timestamp"] = "2026-10-23T01:02:03.0000000+00:00";
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", native);
        var first = ActionSourceWorkspace.Prepare(_directory);
        Assert.IsTrue(JToken.DeepEquals(native, first.Body));
        ActionSourceWorkspace.Checkpoint(first, 8);
        Assert.IsTrue(JToken.DeepEquals(native, ActionSourceWorkspace.Prepare(_directory).Body));
    }

    [TestMethod]
    public void Prepare_RefusesRootMetadataChanges()
    {
        ActionSourceWorkspace.Open(_directory, ActionId, 7, "fixture", "catalog", Native());
        var sourcePath = Path.Combine(_directory, ActionSourceWorkspace.SourceFile);
        var caw = ProgramSourceCodec.Decode(File.ReadAllText(sourcePath));
        caw["Title"] = "change metadata through program body";
        File.WriteAllText(sourcePath, ProgramSourceCodec.Encode(caw));
        Assert.ThrowsException<InvalidOperationException>(() => ActionSourceWorkspace.Prepare(_directory));
    }

    [TestMethod]
    public void RelativePaths_ResolveAgainstExplicitWorkspace()
    {
        var args = JsonSerializer.SerializeToElement(new { dir = ".tmp/source", workspaceRoot = _directory });
        Assert.AreEqual(Path.GetFullPath(Path.Combine(_directory, ".tmp/source")), ActionSourceServeOps.ResolveDirectory(args));
    }

    [TestMethod]
    public async Task ConcurrentOpen_OnlyOneActionCanClaimDirectory()
    {
        var attempts = await Task.WhenAll(Enumerable.Range(0, 2).Select(i => Task.Run(() =>
        {
            try
            {
                ActionSourceWorkspace.Open(_directory, i == 0 ? ActionId : "12f940bf-390e-45ea-a034-76bbe9871f77",
                    7, "fixture", "catalog", Native());
                return true;
            }
            catch (Exception ex) when (ex is IOException or InvalidOperationException) { return false; }
        })));
        Assert.AreEqual(1, attempts.Count(success => success));
        Assert.IsNotNull(ActionSourceWorkspace.Prepare(_directory));
    }

    private JsonElement Args(bool dryRun) => JsonSerializer.SerializeToElement(new { dir = _directory, dryRun });

    [TestMethod]
    public async Task V2DraftSidecar_BindsFilesDryRunConsecutiveSavesAndNativeIdentity()
    {
        await using var host = new FakeBindingHost("v2");
        var native = Native();
        native["Variables"]![0]!["DefaultValue"] = Script;
        ActionSourceWorkspace.Open(_directory, ActionId, 3, "draft fixture", "draft", native,
            hostBinding: host.Binding,
            storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 3 });
        var baselinePath = Path.Combine(_directory, ActionSourceWorkspace.BaselineFile);
        var baseline = File.ReadAllText(baselinePath);
        Assert.IsTrue((await ActionSourceServeOps.SaveAsync(null, Args(true), default)).Ok);
        Assert.AreEqual(baseline, File.ReadAllText(baselinePath));
        var prepared = ActionSourceWorkspace.Prepare(_directory);
        Assert.AreEqual("draft-1", prepared.StorageIdentity!.DraftId);
        Assert.IsTrue(JToken.DeepEquals(native, prepared.Body));
        var files = Directory.GetFiles(Path.Combine(_directory, "files"));
        Assert.AreEqual(2, files.Length); // script and variable default, both materialized offline.
        File.WriteAllText(files.Single(p => File.ReadAllText(p) == Script && Path.GetFileName(p) == "source-2.txt"), "changed script\n");
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        var versions = new List<long>();
        host.ApplyWithStorage = (id, storage, version, force) =>
        {
            Assert.AreEqual(ActionId, id);
            Assert.IsFalse(force);
            Assert.AreEqual("draft", storage.Kind);
            Assert.AreEqual("draft-1", storage.DraftId);
            Assert.AreEqual(version, storage.Version);
            versions.Add(storage.Version);
            return new QuickerRpcApplyXActionResult
            { Success = true, Persisted = true, ActionId = id, EditVersion = storage.Version + 1,
                StorageIdentity = new() { Kind = "draft", DraftId = "draft-1", Version = storage.Version + 1 } };
        };
        Assert.IsTrue((await ActionSourceServeOps.SaveAsync(session.Rpc, Args(false), default)).Ok);
        Assert.IsTrue((await ActionSourceServeOps.SaveAsync(session.Rpc, Args(false), default)).Ok);
        CollectionAssert.AreEqual(new long[] { 3, 4 }, versions);
        Assert.AreEqual(5L, ActionSourceWorkspace.Prepare(_directory).StorageIdentity!.Version);
        Assert.IsTrue(host.Binding.SameDestination(ActionSourceWorkspace.Prepare(_directory).HostBinding!));
        Assert.AreEqual(2, host.StorageWrites);
        Assert.AreEqual(host.StorageWrites, host.Writes);
    }

    [TestMethod]
    public async Task V2PartialCommit_PreservesCheckpointAndReportsPersistence()
    {
        await using var host = new FakeBindingHost("v2");
        ActionSourceWorkspace.Open(_directory, ActionId, 3, "draft fixture", "draft", Native(),
            hostBinding: host.Binding,
            storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 3 });
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        host.ApplyWithStorage = (_, _, _, _) => new QuickerRpcApplyXActionResult
        { Persisted = true, ErrorCode = "SOURCE_POST_COMMIT_FAILED", ErrorMessage = "fixture", EditVersion = 4,
            StorageIdentity = new() { Kind = "draft", DraftId = "draft-1", Version = 4 } };
        var response = await ActionSourceServeOps.SaveAsync(session.Rpc, Args(false), default);
        Assert.IsFalse(response.Ok);
        Assert.AreEqual("SOURCE_POST_COMMIT_FAILED", response.Error);
        var data = JsonSerializer.SerializeToElement(response.Data, QkrpcJson.CliOutput);
        Assert.IsTrue(data.GetProperty("persisted").GetBoolean());
        Assert.AreEqual(3L, ActionSourceWorkspace.Prepare(_directory).EditVersion);
    }

    [TestMethod]
    public async Task IdentityBoundBundle_SelectsNewRPCOnceWithoutLegacyRetry()
    {
        await using var host = new FakeBindingHost("v2", storage: false);
        ActionSourceWorkspace.Open(_directory, ActionId, 3, "draft fixture", "draft", Native(),
            hostBinding: host.Binding,
            storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 3 });
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        await Assert.ThrowsExceptionAsync<RemoteMethodNotFoundException>(() => ActionSourceServeOps.SaveAsync(session.Rpc, Args(false), default));
        Assert.AreEqual(0, host.Writes);
        Assert.AreEqual(3L, ActionSourceWorkspace.Prepare(_directory).EditVersion);
    }

    [TestMethod]
    public async Task Storage_bound_bundle_rejects_a_different_host_before_either_write_entry()
    {
        await using var source = new FakeBindingHost("v2");
        await using var other = new FakeBindingHost("v2");
        ActionSourceWorkspace.Open(_directory, ActionId, 3, "draft fixture", "draft", Native(),
            hostBinding: source.Binding, storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 3 });
        await using var session = await QuickerRpcClient.ConnectBoundAsync(other.Binding);
        var error = await Assert.ThrowsExceptionAsync<QuickerRpcClientException>(() => ActionSourceServeOps.SaveAsync(session.Rpc, Args(false), default));
        Assert.AreEqual(QuickerRpcBindingErrors.Mismatch, error.ErrorCode);
        Assert.AreEqual(0, source.Writes + other.Writes);
        Assert.AreEqual(3L, ActionSourceWorkspace.Prepare(_directory).StorageIdentity!.Version);
    }

    [TestMethod]
    public async Task NativeRpcOpenAndCheckpoint_PreserveExactNumericLexemesOnDisk()
    {
        var lexemes = new[] { "9007199254740993", "9223372036854775807", "0.123456789012345678901", "1.230000000000000000001e+123", "1e999", "-0" };
        var native = Native();
        native["FutureNumbers"] = new JArray(lexemes.Select(value => new JRaw(value)));
        var nativeJson = native.ToString(Formatting.None);
        await using var host = new FakeBindingHost("v2") { BodyJson = nativeJson,
            StorageIdentity = new() { Kind = "catalog", Version = 7, ContentHash = "fixture-native-hash" } };
        await using var session = await QuickerRpcClient.ConnectBoundAsync(host.Binding);
        var args = JsonSerializer.SerializeToElement(new { id = ActionId, dir = _directory, noAutoFiles = true });
        var opened = await ActionSourceServeOps.OpenAsync(session.Rpc, args, default);
        Assert.IsTrue(opened.Ok, opened.Message);
        var prepared = ActionSourceWorkspace.Prepare(_directory);
        CollectionAssert.AreEqual(lexemes, ((JArray)prepared.Body["FutureNumbers"]!).Select(value => value.ToString(Formatting.None)).ToArray());
        ActionSourceWorkspace.Checkpoint(prepared, 8);
        var reloaded = ActionSourceWorkspace.Prepare(_directory);
        Assert.AreEqual(8L, reloaded.EditVersion);
        Assert.IsTrue(host.Binding.SameDestination(reloaded.HostBinding!));
        Assert.AreEqual(8L, reloaded.StorageIdentity!.Version);
        CollectionAssert.AreEqual(lexemes, ((JArray)reloaded.Body["FutureNumbers"]!).Select(value => value.ToString(Formatting.None)).ToArray());
    }

    [TestMethod]
    public void V2StorageIdentityTampering_IsRejectedOffline()
    {
        ActionSourceWorkspace.Open(_directory, ActionId, 3, "draft fixture", "draft", Native(),
            storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 3 });
        var path = Path.Combine(_directory, ActionSourceWorkspace.IdentityFile);
        var identity = JObject.Parse(File.ReadAllText(path));
        identity["storageIdentity"]!["draftId"] = "another-draft";
        File.WriteAllText(path, identity.ToString());
        Assert.ThrowsException<InvalidOperationException>(() => ActionSourceWorkspace.Prepare(_directory));
    }

    private static JObject Native() => new()
    {
        ["Id"] = ActionId,
        ["Title"] = "native metadata",
        ["FutureRoot"] = new JObject { ["null"] = JValue.CreateNull(), ["v"] = 2 },
        ["Steps"] = new JArray(new JObject
        {
            ["StepRunnerKey"] = "sys:evalexpression", ["StepId"] = "original-step", ["Disabled"] = false,
            ["FutureStep"] = new JObject { ["keep"] = true },
            ["InputParams"] = new JObject
            {
                ["expression"] = new JObject
                { ["VarKey"] = "", ["Value"] = Script, ["FutureParam"] = "keep", ["NullParam"] = JValue.CreateNull() },
            },
            ["OutputParams"] = new JObject(), ["IfSteps"] = new JArray(), ["ElseSteps"] = new JArray(),
        }),
        ["Variables"] = new JArray(new JObject
        { ["Key"] = "answer", ["Type"] = 0, ["Id"] = "native-variable", ["DefaultValue"] = "", ["FutureVariable"] = 42 }),
        ["SubPrograms"] = new JArray(),
    };

}
