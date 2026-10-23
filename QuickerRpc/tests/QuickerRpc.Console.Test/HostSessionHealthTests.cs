using System.Reflection;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class HostSessionHealthTests
{
    [TestMethod]
    public async Task Health_preserves_legacy_fields_and_includes_the_wire_handshake()
    {
        var rpc = DispatchProxy.Create<IQuickerRpcService, FakeRpc>();
        var fake = (FakeRpc)(object)rpc;
        fake.Session = new()
        {
            HostSessionId = "fixture-session", ProtocolVersion = 1,
            Host = new() { Kind = "v1", QuickerVersion = "fixture", AdapterAssembly = "fake" },
            Capabilities = new Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.ActionSourceWrite] = true },
        };
        var response = await ServeHealthQuery.ReadAsync(rpc, CancellationToken.None);
        Assert.IsTrue(response.Ok);
        Assert.AreEqual("pong", response.Pong);
        Assert.AreEqual(1, response.ProtocolVersion);
        Assert.AreEqual(QuickerRpcPipeNames.ServerPipe, response.Pipe);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        var host = json.RootElement.GetProperty("hostSession");
        Assert.AreEqual("qkrpc", host.GetProperty("service").GetString());
        Assert.AreEqual("fixture-session", host.GetProperty("hostSessionId").GetString());
        Assert.AreEqual("v1", host.GetProperty("host").GetProperty("kind").GetString());
        Assert.IsTrue(host.GetProperty("capabilities").GetProperty(QuickerRpcHostCapabilityNames.ActionSourceWrite).GetBoolean());
        Assert.AreEqual(3, fake.Calls);
    }

    [TestMethod]
    public async Task Unavailable_handshake_is_omitted_without_changing_existing_health_shape()
    {
        var rpc = DispatchProxy.Create<IQuickerRpcService, FakeRpc>();
        var response = await ServeHealthQuery.ReadAsync(rpc, CancellationToken.None);
        Assert.IsNull(response.HostSession);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(response));
        Assert.IsFalse(json.RootElement.TryGetProperty("hostSession", out _));
        Assert.AreEqual("qkrpc", response.Service);
        Assert.IsNull(response.HostBinding);
        Assert.IsTrue(response.Ok);
    }

    [TestMethod]
    public async Task Canceled_health_does_not_query_any_rpc_method()
    {
        var rpc = DispatchProxy.Create<IQuickerRpcService, FakeRpc>();
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ServeHealthQuery.ReadAsync(rpc, stop.Token));
        Assert.AreEqual(0, ((FakeRpc)(object)rpc).Calls);
    }

    public class FakeRpc : DispatchProxy
    {
        public QuickerRpcHostSessionInfo? Session { get; set; }
        public int Calls { get; private set; }
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            Calls++;
            return targetMethod!.Name switch
            {
                nameof(IQuickerRpcService.PingAsync) => Task.FromResult("pong"),
                nameof(IQuickerRpcService.GetProtocolVersionAsync) => Task.FromResult(1),
                nameof(IQuickerRpcService.GetHostSessionAsync) when Session is not null => Task.FromResult(Session),
                nameof(IQuickerRpcService.GetHostSessionAsync) => Task.FromResult<QuickerRpcHostSessionInfo>(null!),
                _ => throw new AssertFailedException("Unexpected RPC method: " + targetMethod.Name),
            };
        }
    }
}
