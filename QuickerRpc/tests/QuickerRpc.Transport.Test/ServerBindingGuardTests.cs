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
public sealed class ServerBindingGuardTests
{
    [TestMethod]
    public async Task Dedicated_connection_requires_its_own_handshake_and_legacy_alias_never_allows_writes()
    {
        foreach (var legacy in new[] { false, true })
        foreach (var sourceWrite in new[] { false, true })
        {
            var inner = DispatchProxy.Create<IQuickerRpcService, RecordingService>();
            var fixture = (RecordingService)(object)inner;
            fixture.SourceWrite = sourceWrite;
            await RunConnection(inner, fixture, legacy);
        }
    }

    private static async Task RunConnection(IQuickerRpcService inner, RecordingService fixture, bool legacy)
    {
        var name = "qkrpc-server-guard-" + Guid.NewGuid().ToString("N");
        using var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepted = server.WaitForConnectionAsync(stop.Token);
        await client.ConnectAsync(stop.Token);
        await accepted;
        using var serverRpc = StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(server,
            new QuickerRpcGuardedService(inner, server: true, legacyEndpoint: legacy));
        var (clientRpc, rpc) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(client);
        using (clientRpc)
        {
            var required = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceAsync("fixture", "{}"));
            StringAssert.Contains(required.ErrorData!.ToString()!, QuickerRpcBindingErrors.Required);
            await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceWithStorageAsync("fixture", "{}", new() { Kind = "catalog", Version = 7 }));
            Assert.AreEqual(0, fixture.Writes);
            await rpc.GetHostSessionAsync();
            if (legacy)
            {
                await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceAsync("fixture", "{}"));
                await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceWithStorageAsync("fixture", "{}", new() { Kind = "catalog", Version = 7 }));
                Assert.AreEqual(0, fixture.Writes);
            }
            else
            {
                if (fixture.SourceWrite)
                {
                    await rpc.ApplyActionProgramSourceAsync("fixture", "{}");
                    await rpc.ApplyActionProgramSourceWithStorageAsync("fixture", "{}", new() { Kind = "catalog", Version = 7 });
                    Assert.AreEqual(2, fixture.Writes);
                }
                else
                {
                    var unsupported = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceAsync("fixture", "{}"));
                    StringAssert.Contains(unsupported.ErrorData!.ToString()!, QuickerRpcBindingErrors.Unsupported);
                    unsupported = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => rpc.ApplyActionProgramSourceWithStorageAsync("fixture", "{}", new() { Kind = "catalog", Version = 7 }));
                    StringAssert.Contains(unsupported.ErrorData!.ToString()!, QuickerRpcBindingErrors.Unsupported);
                    Assert.AreEqual(0, fixture.Writes);
                }
            }
        }
    }

    public class RecordingService : DispatchProxy
    {
        public int Writes;
        public bool SourceWrite;
        private readonly string session = Guid.NewGuid().ToString("N");
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method!.Name == nameof(IQuickerRpcService.GetHostSessionAsync))
                return Task.FromResult(new QuickerRpcHostSessionInfo
                {
                    HostInstanceId = "fixture", HostSessionId = session, Endpoint = QuickerRpcEndpointNames.ForSession(session),
                    ProtocolVersion = 1, Host = new() { Kind = "v1" },
                    Capabilities = new System.Collections.Generic.Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.ActionSourceWrite] = SourceWrite },
                });
            if (method.Name == nameof(IQuickerRpcService.ApplyActionProgramSourceAsync)
                || method.Name == nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync))
            { Interlocked.Increment(ref Writes); return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true }); }
            throw new AssertFailedException("Unexpected fake method: " + method.Name);
        }
    }
}
