using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class HostSessionContractTests
{
    [TestMethod]
    public async Task Host_session_roundtrips_identity_versions_and_operation_flags_across_reconnections()
    {
        var target = new CurrentTarget();
        for (var connection = 0; connection < 2; connection++)
        {
            using var session = await ContractSession.ConnectAsync(target);
            var result = await QuickerRpcHostSessionClient.TryGetAsync(session.Proxy);
            Assert.IsNotNull(result);
            Assert.AreEqual(target.SessionId, result.HostSessionId);
            Assert.AreEqual("qkrpc", result.Service);
            Assert.AreEqual(1, result.SchemaVersion);
            Assert.AreEqual(1, result.ProtocolVersion);
            Assert.AreEqual("v2", result.Host.Kind);
            Assert.AreEqual("2.fixture", result.Host.QuickerVersion);
            Assert.AreEqual("fake-adapter", result.Host.AdapterAssembly);
            Assert.IsFalse(result.Capabilities[QuickerRpcHostCapabilityNames.ActionSourceWrite]);
            Assert.IsTrue(result.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite]);
            Assert.IsTrue(result.Capabilities[QuickerRpcHostCapabilityNames.ActionWriteDesignerOpenGuard]);
        }
    }

    [TestMethod]
    public async Task Old_rpc_without_handshake_returns_no_invented_identity()
    {
        using var session = await ContractSession.ConnectAsync(new LegacyTarget());
        Assert.IsNull(await QuickerRpcHostSessionClient.TryGetAsync(session.Proxy));
        Assert.AreEqual("pong", await session.Proxy.PingAsync());
    }

    [TestMethod]
    public async Task Real_handshake_failures_and_cancellation_are_not_misclassified_as_legacy_support()
    {
        using var session = await ContractSession.ConnectAsync(new FailedTarget());
        await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => QuickerRpcHostSessionClient.TryGetAsync(session.Proxy));
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => QuickerRpcHostSessionClient.TryGetAsync(session.Proxy, stop.Token));
    }

    public class LegacyTarget
    {
        public Task<string> PingAsync(CancellationToken cancellationToken = default) => Task.FromResult("pong");
    }

    public sealed class CurrentTarget : LegacyTarget
    {
        public string SessionId { get; } = Guid.NewGuid().ToString("N");
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default) => Task.FromResult(new QuickerRpcHostSessionInfo
        {
            ProtocolVersion = 1, HostSessionId = SessionId,
            Host = new() { Kind = "v2", QuickerVersion = "2.fixture", AdapterAssembly = "fake-adapter" },
            Capabilities = new Dictionary<string, bool>
            {
                [QuickerRpcHostCapabilityNames.ActionSourceWrite] = false,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite] = true,
                [QuickerRpcHostCapabilityNames.ActionWriteDesignerOpenGuard] = true,
            },
        });
    }

    public sealed class FailedTarget : LegacyTarget
    {
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default) =>
            throw new InvalidOperationException("fake handshake failure");
    }

    private sealed class ContractSession : IDisposable
    {
        private readonly NamedPipeServerStream server;
        private readonly NamedPipeClientStream client;
        private readonly JsonRpc serverRpc;
        private readonly JsonRpc clientRpc;
        private ContractSession(NamedPipeServerStream server, NamedPipeClientStream client, object target)
        {
            this.server = server;
            this.client = client;
            serverRpc = StreamJsonRpcFactory.StartListeningServer(server, target);
            clientRpc = StreamJsonRpcFactory.CreateDuplexJsonRpc(client);
            Proxy = clientRpc.Attach<IQuickerRpcService>();
            clientRpc.StartListening();
        }
        public IQuickerRpcService Proxy { get; }
        public static async Task<ContractSession> ConnectAsync(object target)
        {
            var name = "qkrpc-host-session-fixture-" + Guid.NewGuid().ToString("N");
            var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
                var accepted = server.WaitForConnectionAsync(stop.Token);
                await client.ConnectAsync(stop.Token);
                await accepted;
                return new(server, client, target);
            }
            catch { client.Dispose(); server.Dispose(); throw; }
        }
        public void Dispose() { clientRpc.Dispose(); serverRpc.Dispose(); client.Dispose(); server.Dispose(); }
    }
}
