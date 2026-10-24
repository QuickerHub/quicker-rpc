using System;
using System.IO.Pipes;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using StreamJsonRpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class ActionProgramSourceContractTests
{
    private const string NativeBody = "{\"steps\":[{\"stepRunnerKey\":\"custom:future\",\"unknown\":{\"null\":null,\"enabled\":true,\"script\":\"第一行\\nreturn \\\"text\\\";\"}}],\"variables\":[],\"subPrograms\":[],\"futureRoot\":[1,2,3]}";

    [TestMethod]
    public async Task SourceRead_roundtrips_native_json_identity_warnings_and_metadata_over_actual_rpc()
    {
        var target = DispatchProxy.Create<IQuickerRpcService, SourceTarget>();
        var implementation = (SourceTarget)(object)target;
        implementation.ReadResult = new QuickerRpcGetActionProgramSourceResult
        {
            Success = true,
            ActionId = "action-1",
            EditVersion = 9007199254740993L,
            StorageIdentity = new() { Kind = "draft", DraftId = "draft-1", Version = 9007199254740993L, ContentHash = "native-hash" },
            BodyJson = NativeBody,
            ReadSource = "catalog",
            Title = "中文动作",
            Description = "description",
            Icon = "fa:code",
            ContextMenuData = "menu\nitem",
            Warnings = new[] { "Action Designer is open.", "Catalog body only." },
        };
        using var session = await ContractSession.ConnectAsync(target);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var result = await session.Proxy.GetActionProgramSourceAsync("action-1", timeout.Token);

        Assert.AreEqual("action-1", implementation.ActionId);
        Assert.IsTrue(result.Success);
        Assert.AreEqual(9007199254740993L, result.EditVersion);
        Assert.AreEqual("draft-1", result.StorageIdentity!.DraftId);
        Assert.AreEqual("native-hash", result.StorageIdentity.ContentHash);
        Assert.AreEqual(9007199254740993L, result.StorageIdentity.Version);
        Assert.AreEqual(NativeBody, result.BodyJson);
        Assert.AreEqual("catalog", result.ReadSource);
        Assert.AreEqual("中文动作", result.Title);
        Assert.AreEqual("description", result.Description);
        Assert.AreEqual("fa:code", result.Icon);
        Assert.AreEqual("menu\nitem", result.ContextMenuData);
        CollectionAssert.AreEqual(new[] { "Action Designer is open.", "Catalog body only." }, new System.Collections.Generic.List<string>(result.Warnings));
    }

    [TestMethod]
    public async Task SourceWrite_roundtrips_native_input_and_structured_conflict_without_loss()
    {
        var target = DispatchProxy.Create<IQuickerRpcService, SourceTarget>();
        var implementation = (SourceTarget)(object)target;
        implementation.WriteResult = new QuickerRpcApplyXActionResult
        {
            ActionId = "action-1",
            ErrorCode = "VERSION_CONFLICT",
            ErrorMessage = "Re-read source.",
            VersionConflict = true,
            EditVersion = 9007199254740995L,
            Warnings = new[] { "保存已阻止" },
        };
        using var session = await ContractSession.ConnectAsync(target);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        var conflict = await session.Proxy.ApplyActionProgramSourceWithStorageAsync(
            "action-1", NativeBody, new() { Kind = "draft", DraftId = "draft-1", Version = 9007199254740993L, ContentHash = "native-hash" },
            9007199254740993L, cancellationToken: timeout.Token);

        Assert.AreEqual(NativeBody, implementation.BodyJson);
        Assert.AreEqual(9007199254740993L, implementation.ExpectedEditVersion);
        Assert.IsFalse(implementation.Force);
        Assert.AreEqual("draft-1", implementation.StorageIdentity!.DraftId);
        Assert.AreEqual("native-hash", implementation.StorageIdentity.ContentHash);
        Assert.IsFalse(conflict.Success);
        Assert.AreEqual("VERSION_CONFLICT", conflict.ErrorCode);
        Assert.AreEqual(true, conflict.VersionConflict);
        Assert.AreEqual(9007199254740995L, conflict.EditVersion);
        Assert.AreEqual("保存已阻止", conflict.Warnings[0]);

        implementation.WriteResult = new QuickerRpcApplyXActionResult { ErrorCode = "DESIGNER_OPEN" };
        var designer = await session.Proxy.ApplyActionProgramSourceAsync("action-1", NativeBody, force: true, cancellationToken: timeout.Token);
        Assert.IsTrue(implementation.Force);
        Assert.IsNull(implementation.ExpectedEditVersion);
        Assert.AreEqual("DESIGNER_OPEN", designer.ErrorCode);
        Assert.IsFalse(designer.Success);
        implementation.WriteResult = new QuickerRpcApplyXActionResult
        { Persisted = true, ErrorCode = "SOURCE_POST_COMMIT_FAILED", EditVersion = 9007199254740995L,
            StorageIdentity = new() { Kind = "draft", DraftId = "draft-1", Version = 9007199254740995L } };
        var partial = await session.Proxy.ApplyActionProgramSourceAsync("action-1", NativeBody, cancellationToken: timeout.Token);
        Assert.AreEqual(true, partial.Persisted);
        Assert.AreEqual("SOURCE_POST_COMMIT_FAILED", partial.ErrorCode);
        Assert.AreEqual(9007199254740995L, partial.StorageIdentity!.Version);
    }

    [TestMethod]
    public async Task New_client_calls_original_source_wire_on_legacy_server_without_extra_null_identity()
    {
        var target = new LegacySourceTarget();
        using var session = await ContractSession.ConnectAsync(target);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var result = await session.Proxy.ApplyActionProgramSourceAsync("action-1", NativeBody, 123, false, timeout.Token);
        Assert.IsTrue(result.Success);
        Assert.AreEqual(1, target.Writes);
        Assert.AreEqual(NativeBody, target.BodyJson);
        Assert.AreEqual(123L, target.ExpectedEditVersion);
    }

    [TestMethod]
    public async Task Legacy_client_calls_new_server_using_unchanged_source_method()
    {
        var target = DispatchProxy.Create<IQuickerRpcService, SourceTarget>();
        var implementation = (SourceTarget)(object)target;
        implementation.WriteResult = new() { Success = true, EditVersion = 124 };
        using var session = await ContractSession.ConnectAsync(target);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var result = await session.LegacyProxy.ApplyActionProgramSourceAsync("action-1", NativeBody, 123, true, timeout.Token);
        Assert.IsTrue(result.Success);
        Assert.AreEqual(123L, implementation.ExpectedEditVersion);
        Assert.IsTrue(implementation.Force);
        Assert.IsNull(implementation.StorageIdentity);
    }

    [TestMethod]
    public async Task Identity_bound_method_missing_on_legacy_server_does_not_replay_through_original_entry()
    {
        var target = new LegacySourceTarget();
        using var session = await ContractSession.ConnectAsync(target);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await Assert.ThrowsExceptionAsync<RemoteMethodNotFoundException>(() => session.Proxy.ApplyActionProgramSourceWithStorageAsync(
            "action-1", NativeBody, new() { Kind = "draft", DraftId = "fixture", Version = 123 }, 123, cancellationToken: timeout.Token));
        Assert.AreEqual(0, target.Writes);
    }

    // Deliberately isolated from the current interface to model an already-deployed CLI/server wire signature.
    public interface ILegacySourceClient
    {
        Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(string actionId, string bodyJson,
            long? expectedEditVersion = null, bool force = false, CancellationToken cancellationToken = default);
    }

    public sealed class LegacySourceTarget : ILegacySourceClient
    {
        public int Writes { get; private set; }
        public string? BodyJson { get; private set; }
        public long? ExpectedEditVersion { get; private set; }
        public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(string actionId, string bodyJson,
            long? expectedEditVersion = null, bool force = false, CancellationToken cancellationToken = default)
        {
            Writes++;
            BodyJson = bodyJson;
            ExpectedEditVersion = expectedEditVersion;
            return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, ActionId = actionId, EditVersion = 124 });
        }
    }

    public class SourceTarget : DispatchProxy
    {
        public QuickerRpcGetActionProgramSourceResult ReadResult { get; set; } = new();
        public QuickerRpcApplyXActionResult WriteResult { get; set; } = new();
        public string? ActionId { get; private set; }
        public string? BodyJson { get; private set; }
        public long? ExpectedEditVersion { get; private set; }
        public bool Force { get; private set; }
        public QuickerRpcActionStorageIdentity? StorageIdentity { get; private set; }

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            ActionId = (string?)args![0];
            switch (targetMethod!.Name)
            {
                case nameof(IQuickerRpcService.GetActionProgramSourceAsync):
                    return Task.FromResult(ReadResult);
                case nameof(IQuickerRpcService.ApplyActionProgramSourceAsync):
                    BodyJson = (string?)args[1];
                    ExpectedEditVersion = (long?)args[2];
                    Force = (bool)args[3]!;
                    StorageIdentity = null;
                    return Task.FromResult(WriteResult);
                case nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync):
                    BodyJson = (string?)args[1];
                    StorageIdentity = (QuickerRpcActionStorageIdentity?)args[2];
                    ExpectedEditVersion = (long?)args[3];
                    Force = (bool)args[4]!;
                    return Task.FromResult(WriteResult);
                default:
                    throw new NotSupportedException(targetMethod.Name);
            }
        }
    }

    private sealed class ContractSession : IDisposable
    {
        private readonly NamedPipeServerStream _server;
        private readonly NamedPipeClientStream _client;
        private readonly JsonRpc _serverRpc;
        private readonly JsonRpc _clientRpc;

        private ContractSession(NamedPipeServerStream server, NamedPipeClientStream client, object target)
        {
            _server = server;
            _client = client;
            _serverRpc = target is IQuickerRpcService current
                ? StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(server, current)
                : StreamJsonRpcFactory.StartListeningServer(server, target);
            _clientRpc = StreamJsonRpcFactory.CreateDuplexJsonRpc(client);
            Proxy = _clientRpc.Attach<IQuickerRpcService>();
            LegacyProxy = _clientRpc.Attach<ILegacySourceClient>();
            _clientRpc.StartListening();
        }

        public IQuickerRpcService Proxy { get; }
        public ILegacySourceClient LegacyProxy { get; }

        public static async Task<ContractSession> ConnectAsync(object target)
        {
            var pipeName = "qkrpc-source-contract-" + Guid.NewGuid().ToString("N");
            var server = CurrentUserPipeFixture.Create(pipeName, 1, PipeOptions.Asynchronous);
            var client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                var accepted = server.WaitForConnectionAsync(timeout.Token);
                await client.ConnectAsync(timeout.Token);
                await accepted;
                return new ContractSession(server, client, target);
            }
            catch
            {
                client.Dispose();
                server.Dispose();
                throw;
            }
        }

        public void Dispose()
        {
            _clientRpc.Dispose();
            _serverRpc.Dispose();
            _client.Dispose();
            _server.Dispose();
        }
    }
}
