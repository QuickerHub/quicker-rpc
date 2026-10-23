using System.Reflection;
using QuickerRpc.Testing;
using QuickerRpc.Transport;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
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
            { Success = true, ActionId = ActionId, EditVersion = versions.Count + 7 };
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

    public class SourceRpcProxy : DispatchProxy
    {
        public Func<MethodInfo, object?[]?, object?>? Handler { get; set; }
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => Handler!(targetMethod!, args);
    }
}
