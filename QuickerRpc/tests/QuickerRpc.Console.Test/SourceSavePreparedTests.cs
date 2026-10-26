using System.Reflection;
using System.IO.Pipes;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;
using QuickerRpc.Testing;
using StreamJsonRpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class SourceSavePreparedTests
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "qkrpc-source-prepared-" + Guid.NewGuid().ToString("N"));
    private const string Id = "c48202e2-e309-4723-9d2a-7a83a29b38fb";

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [TestMethod]
    public async Task Prepared_write_consumes_one_frozen_body_and_preserves_late_source_edits_as_pending()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var source = Path.Combine(directory, ActionSourceWorkspace.SourceFile);
        var late = File.ReadAllText(source).Replace("before", "after", StringComparison.Ordinal);
        File.WriteAllText(source, late);
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.IsTrue(result.Ok, result.Error + ": " + result.Message);
        Assert.AreEqual(1, recorder.Calls);
        Assert.AreEqual(prepared.EditableBodyJson, recorder.Body);
        StringAssert.Contains(recorder.Body!, "before");
        Assert.AreEqual(late, File.ReadAllText(source));
        var receipt = Data(result);
        Assert.AreEqual(prepared.SnapshotRevision, receipt.GetProperty("consumedSnapshot").GetString());
        Assert.AreEqual(prepared.ConsumedBodyHash, receipt.GetProperty("consumedBodyHash").GetString());
        Assert.AreEqual("updated", receipt.GetProperty("checkpointStatus").GetString());
        var wire = JsonSerializer.SerializeToElement(result, QkrpcJson.CliOutput).GetProperty("data");
        Assert.AreEqual(JsonValueKind.Null, wire.GetProperty("storageIdentity").ValueKind);
        Assert.AreEqual(8L, ActionSourceWorkspace.Prepare(directory).EditVersion);
        Assert.AreNotEqual(prepared.ConsumedBodyHash, ActionSourceWorkspace.Prepare(directory).ConsumedBodyHash);
    }

    [TestMethod]
    public async Task Confirmed_storage_save_returns_the_actual_new_storage_identity_on_the_wire()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc, new QuickerRpcActionStorageIdentity { Kind = "draft", DraftId = "owned-draft", Version = 7 });
        var prepared = ActionSourceWorkspace.Prepare(directory);
        recorder.Apply = (_, _) => Task.FromResult(new QuickerRpcApplyXActionResult {
            Success = true, Persisted = true, ActionId = Id, EditVersion = 8,
            StorageIdentity = new() { Kind = "draft", DraftId = "owned-draft", Version = 8, ContentHash = "actual-saved-hash" } });
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.IsTrue(result.Ok, result.Error + ": " + result.Message);
        var storage = JsonSerializer.SerializeToElement(result, QkrpcJson.CliOutput).GetProperty("data").GetProperty("storageIdentity");
        Assert.AreEqual("owned-draft", storage.GetProperty("draftId").GetString());
        Assert.AreEqual(8L, storage.GetProperty("version").GetInt64());
        Assert.AreEqual("actual-saved-hash", storage.GetProperty("contentHash").GetString());
        Assert.AreEqual(8L, ActionSourceWorkspace.Prepare(directory).StorageIdentity!.Version);
        Assert.AreEqual(1, recorder.Calls);
    }

    [TestMethod]
    public async Task Managed_change_after_prepare_rejects_before_dispatch_without_overwriting_sidecars()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var identity = Path.Combine(directory, ActionSourceWorkspace.IdentityFile);
        var changed = File.ReadAllText(identity) + "\n";
        File.WriteAllText(identity, changed);
        var baseline = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile));
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.IsFalse(result.Ok);
        Assert.AreEqual(0, recorder.Calls);
        Assert.AreEqual(changed, File.ReadAllText(identity));
        CollectionAssert.AreEqual(baseline, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile)));
    }

    [TestMethod]
    public async Task Confirmed_host_receipt_survives_checkpoint_CAS_failure_and_is_not_replayed()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var identity = Path.Combine(directory, ActionSourceWorkspace.IdentityFile);
        var changed = File.ReadAllText(identity) + "\n";
        var baseline = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile));
        recorder.Apply = (_, _) =>
        {
            File.WriteAllText(identity, changed);
            return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, Persisted = true, ActionId = Id, EditVersion = 8 });
        };
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.IsFalse(result.Ok);
        Assert.AreEqual("SOURCE_CHECKPOINT_FAILED", result.Error);
        Assert.AreEqual(1, recorder.Calls);
        var receipt = Data(result);
        Assert.IsTrue(receipt.GetProperty("persisted").GetBoolean());
        Assert.AreEqual("confirmed", receipt.GetProperty("hostSaveStatus").GetString());
        Assert.AreEqual("failed", receipt.GetProperty("checkpointStatus").GetString());
        Assert.AreEqual(prepared.SnapshotRevision, receipt.GetProperty("consumedSnapshot").GetString());
        Assert.AreEqual(changed, File.ReadAllText(identity));
        CollectionAssert.AreEqual(baseline, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile)));
    }

    [TestMethod]
    public async Task Checkpoint_busy_after_confirmed_write_preserves_persisted_receipt_and_releases_no_foreign_lease()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        IDisposable? competingOwner = null;
        recorder.Apply = (_, _) =>
        {
            competingOwner = ActionProjectHostBinding.ClaimValidation(directory, null);
            return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, Persisted = true, ActionId = Id, EditVersion = 8 });
        };
        try
        {
            var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
            Assert.AreEqual("SOURCE_CHECKPOINT_FAILED", result.Error);
            Assert.IsTrue(Data(result).GetProperty("persisted").GetBoolean());
            Assert.AreEqual("confirmed", Data(result).GetProperty("hostSaveStatus").GetString());
            Assert.AreEqual(JsonValueKind.Null, JsonSerializer.SerializeToElement(result, QkrpcJson.CliOutput)
                .GetProperty("data").GetProperty("storageIdentity").ValueKind);
            Assert.AreEqual(1, recorder.Calls);
            Assert.IsTrue(File.Exists(Path.Combine(directory, ActionProjectHostBinding.LeaseFile)));
        }
        finally { competingOwner?.Dispose(); }
        Assert.AreEqual(7L, ActionSourceWorkspace.Prepare(directory).EditVersion);
    }

    [TestMethod]
    public async Task Unknown_write_and_pre_cancel_never_checkpoint_or_replay()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var identity = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.IdentityFile));
        var baseline = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile));
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, cancelled.Token));
        Assert.AreEqual(0, recorder.Calls);
        recorder.Apply = (_, _) =>
        {
            recorder.Disconnect!();
            return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, Persisted = true });
        };
        var unknown = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.AreEqual(QuickerRpcBindingErrors.UnknownWriteResult, unknown.Error);
        Assert.AreEqual(1, recorder.Calls);
        Assert.AreEqual("unknown", Data(unknown).GetProperty("hostSaveStatus").GetString());
        Assert.AreEqual("not-attempted", Data(unknown).GetProperty("checkpointStatus").GetString());
        Assert.AreEqual(JsonValueKind.Null, Data(unknown).GetProperty("persisted").ValueKind);
        var wire = JsonSerializer.SerializeToElement(unknown, QkrpcJson.CliOutput);
        Assert.AreEqual(JsonValueKind.Null, wire.GetProperty("data").GetProperty("persisted").ValueKind);
        CollectionAssert.AreEqual(identity, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.IdentityFile)));
        CollectionAssert.AreEqual(baseline, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile)));
    }

    [TestMethod]
    public async Task Native_failure_with_unknown_persistence_preserves_null_on_the_wire_without_checkpoint_or_replay()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        recorder.Apply = (_, _) => Task.FromResult(new QuickerRpcApplyXActionResult {
            Success = false, Persisted = null, ErrorCode = "SOURCE_POST_COMMIT_FAILED", ErrorMessage = "native state unconfirmed" });
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.AreEqual("SOURCE_POST_COMMIT_FAILED", result.Error);
        Assert.AreEqual(1, recorder.Calls);
        var wire = JsonSerializer.SerializeToElement(result, QkrpcJson.CliOutput).GetProperty("data");
        Assert.AreEqual(JsonValueKind.Null, wire.GetProperty("persisted").ValueKind);
        Assert.AreEqual("unknown", wire.GetProperty("hostSaveStatus").GetString());
        Assert.AreEqual("not-attempted", wire.GetProperty("checkpointStatus").GetString());
        Assert.AreEqual(7L, ActionSourceWorkspace.Prepare(directory).EditVersion);
    }

    [DataTestMethod]
    [DataRow(null, Id, 8L, "unknown")]
    [DataRow(false, Id, 8L, "rejected")]
    [DataRow(true, null, 8L, "persisted-unconfirmed")]
    [DataRow(true, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff", 8L, "persisted-unconfirmed")]
    [DataRow(true, Id, null, "persisted-unconfirmed")]
    public async Task Success_without_a_complete_matching_persistence_ack_never_advances_checkpoint(
        bool? persisted, string? actionId, long? version, string status)
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        var identity = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.IdentityFile));
        var baseline = File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile));
        recorder.Apply = (_, _) => Task.FromResult(new QuickerRpcApplyXActionResult {
            Success = true, Persisted = persisted, ActionId = actionId, EditVersion = version });
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.AreEqual("SOURCE_SAVE_ACK_INVALID", result.Error);
        Assert.AreEqual(1, recorder.Calls);
        var receipt = JsonSerializer.SerializeToElement(result, QkrpcJson.CliOutput).GetProperty("data");
        Assert.AreEqual(status, receipt.GetProperty("hostSaveStatus").GetString());
        Assert.AreEqual("not-attempted", receipt.GetProperty("checkpointStatus").GetString());
        if (persisted.HasValue) Assert.AreEqual(persisted.Value, receipt.GetProperty("persisted").GetBoolean());
        else Assert.AreEqual(JsonValueKind.Null, receipt.GetProperty("persisted").ValueKind);
        CollectionAssert.AreEqual(identity, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.IdentityFile)));
        CollectionAssert.AreEqual(baseline, File.ReadAllBytes(Path.Combine(directory, ActionSourceWorkspace.BaselineFile)));
    }

    [TestMethod]
    public async Task Success_without_required_storage_ack_does_not_checkpoint_or_downgrade_the_rpc()
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc, new QuickerRpcActionStorageIdentity { Kind = "draft", DraftId = "owned-draft", Version = 7 });
        var prepared = ActionSourceWorkspace.Prepare(directory);
        recorder.Apply = (_, _) => Task.FromResult(new QuickerRpcApplyXActionResult {
            Success = true, Persisted = true, ActionId = Id, EditVersion = 8 });
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.AreEqual("SOURCE_SAVE_ACK_INVALID", result.Error);
        Assert.AreEqual(1, recorder.Calls);
        Assert.AreEqual(nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync), recorder.Method);
        Assert.AreEqual(7L, ActionSourceWorkspace.Prepare(directory).EditVersion);
    }

    [DataTestMethod]
    [DataRow(true, "persisted-unconfirmed")]
    [DataRow(false, "rejected")]
    public async Task Native_failure_preserves_known_persistence_and_does_not_checkpoint(bool persisted, string status)
    {
        await using var owner = await Rpc(); var (rpc, recorder) = owner;
        Open(rpc);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        recorder.Apply = (_, _) => Task.FromResult(new QuickerRpcApplyXActionResult {
            Success = false, Persisted = persisted, ActionId = Id, EditVersion = 8, ErrorCode = "SOURCE_POST_COMMIT_FAILED" });
        var result = await ActionSourceServeOps.SavePreparedAsync(rpc, Args(), prepared, default);
        Assert.AreEqual("SOURCE_POST_COMMIT_FAILED", result.Error);
        Assert.AreEqual(1, recorder.Calls);
        Assert.AreEqual(status, Data(result).GetProperty("hostSaveStatus").GetString());
        Assert.AreEqual("not-attempted", Data(result).GetProperty("checkpointStatus").GetString());
        Assert.AreEqual(7L, ActionSourceWorkspace.Prepare(directory).EditVersion);
    }

    private void Open(IQuickerRpcService rpc, QuickerRpcActionStorageIdentity? storage = null) => ActionSourceWorkspace.Open(directory, Id, 7, "fixture", "catalog",
        new JObject { ["Steps"] = new JArray(), ["Variables"] = new JArray(new JObject {
            ["Key"] = "message", ["VarType"] = 0, ["DefaultValue"] = "before" }), ["SubPrograms"] = new JArray() },
        hostBinding: QuickerRpcClient.GetBinding(rpc), storageIdentity: storage);
    private JsonElement Args() => JsonSerializer.SerializeToElement(new { dir = directory, dryRun = false });
    private static JsonElement Data(ServeInvokeResponse result) => JsonSerializer.SerializeToElement(result.Data);

    private static async Task<OwnedRpc> Rpc()
    {
        var inner = DispatchProxy.Create<IQuickerRpcService, RecordingRpc>();
        var recorder = (RecordingRpc)inner;
        var pipe = CurrentUserPipeFixture.Create(recorder.Info.Endpoint);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        async Task<JsonRpc> Accept()
        {
            await pipe.WaitForConnectionAsync(stop.Token);
            return StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(pipe, inner);
        }
        var accepting = Accept();
        try
        {
            var info = recorder.Info;
            var binding = new QuickerRpcHostBinding(info.HostInstanceId, info.HostSessionId, info.Endpoint, 1, 1,
                info.Host.Kind, info.Host.QuickerVersion, new Dictionary<string, bool>(info.Capabilities));
            var session = await QuickerRpcClient.ConnectBoundAsync(binding, 3, cancellationToken: stop.Token);
            var server = await accepting;
            recorder.Disconnect = server.Dispose;
            return new OwnedRpc(session, recorder, server, pipe);
        }
        catch
        {
            stop.Cancel(); pipe.Dispose();
            try { (await accepting).Dispose(); } catch { }
            throw;
        }
    }

    private sealed class OwnedRpc(QuickerRpcClientSession session, RecordingRpc recorder, JsonRpc server, NamedPipeServerStream pipe) : IAsyncDisposable
    {
        internal void Deconstruct(out IQuickerRpcService rpc, out RecordingRpc recorded) { rpc = session.Rpc; recorded = recorder; }
        public async ValueTask DisposeAsync()
        {
            try { await session.DisposeAsync(); }
            finally { server.Dispose(); pipe.Dispose(); }
        }
    }

    public class RecordingRpc : DispatchProxy
    {
        public int Calls;
        public string? Body;
        public string? Method;
        public Func<string, CancellationToken, Task<QuickerRpcApplyXActionResult>>? Apply;
        public Action? Disconnect;
        internal QuickerRpcHostSessionInfo Info { get; }
        public RecordingRpc()
        {
            var session = Guid.NewGuid().ToString("N");
            Info = new QuickerRpcHostSessionInfo { HostInstanceId = "source-fixture", HostSessionId = session,
                Endpoint = QuickerRpcEndpointNames.ForSession(session), ProtocolVersion = 1,
                Host = new() { Kind = "v1", QuickerVersion = "synthetic" },
                Capabilities = new Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.ActionSourceWrite] = true } };
        }
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method!.Name == nameof(IQuickerRpcService.GetHostSessionAsync))
                return Task.FromResult(Info);
            if (method.Name == nameof(IQuickerRpcService.GetProtocolVersionAsync)) return Task.FromResult(1);
            if (method.Name == nameof(IQuickerRpcService.PingAsync)) return Task.FromResult("pong");
            if (method.Name is nameof(IQuickerRpcService.ApplyActionProgramSourceAsync) or nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync))
            {
                Calls++; Body = (string)args![1]!; Method = method.Name;
                return Apply?.Invoke(Body, (CancellationToken)args[^1]!)
                    ?? Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, Persisted = true, ActionId = Id, EditVersion = 8 });
            }
            throw new InvalidOperationException("Unexpected synthetic RPC: " + method.Name);
        }
    }
}
