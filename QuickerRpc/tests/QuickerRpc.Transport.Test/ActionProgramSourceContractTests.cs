using System;
using System.IO.Pipes;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
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

        var conflict = await session.Proxy.ApplyActionProgramSourceAsync(
            "action-1", NativeBody, 9007199254740993L,
            storageIdentity: new() { Kind = "draft", DraftId = "draft-1", Version = 9007199254740993L, ContentHash = "native-hash" }, cancellationToken: timeout.Token);

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
                    StorageIdentity = (QuickerRpcActionStorageIdentity?)args[4];
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

        private ContractSession(NamedPipeServerStream server, NamedPipeClientStream client, IQuickerRpcService target)
        {
            _server = server;
            _client = client;
            _serverRpc = StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(server, target);
            _clientRpc = StreamJsonRpcFactory.CreateDuplexJsonRpc(client);
            Proxy = _clientRpc.Attach<IQuickerRpcService>();
            _clientRpc.StartListening();
        }

        public IQuickerRpcService Proxy { get; }

        public static async Task<ContractSession> ConnectAsync(IQuickerRpcService target)
        {
            var pipeName = "qkrpc-source-contract-" + Guid.NewGuid().ToString("N");
            var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
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
