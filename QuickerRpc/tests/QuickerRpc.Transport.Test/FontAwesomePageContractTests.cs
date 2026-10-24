using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class FontAwesomePageContractTests
{
    [TestMethod]
    public async Task Guarded_page_wire_preserves_the_owner_criteria_and_full_total_without_legacy_search()
    {
        using var first = await Fixture.ConnectAsync(true, "Light_First");
        using var other = await Fixture.ConnectAsync(false, "Light_Other");
        var info = await first.Proxy.GetHostSessionAsync();
        var client = new QuickerRpcGuardedService(first.Proxy);
        client.Bind(QuickerRpcHostDiscovery.Verify(info, first.Endpoint));
        var page = await client.SearchFontAwesomeIconsPageAsync("camera", "Light", 24, 2);
        Assert.IsTrue(page.Success); CollectionAssert.AreEqual(new[] { "Light_First", "Light_Second" }, new List<string>(page.Names));
        Assert.AreEqual("camera", page.Query); Assert.AreEqual("Light", page.Style); Assert.AreEqual(24, page.Skip);
        Assert.AreEqual(2, page.Take); Assert.AreEqual(500, page.TotalCount); Assert.IsTrue(page.HasMore);
        Assert.AreEqual(1, first.Target.Reads); Assert.AreEqual(0, other.Target.Reads);
        await other.Proxy.GetHostSessionAsync();
        var refused = await Assert.ThrowsExceptionAsync<RemoteInvocationException>(() => other.Proxy.SearchFontAwesomeIconsPageAsync("camera", null));
        StringAssert.Contains(refused.ErrorData!.ToString()!, QuickerRpcBindingErrors.Unsupported);
        Assert.AreEqual(0, other.Target.Reads); Assert.AreEqual(1, first.Target.Reads);
        first.Dispose();
        await Assert.ThrowsExceptionAsync<ObjectDisposedException>(() => client.SearchFontAwesomeIconsPageAsync("camera", null));
        Assert.AreEqual(0, other.Target.Reads, "A disconnected owner cannot redirect a page request to another host.");
    }

    [TestMethod]
    public async Task Guarded_page_preabort_does_not_dispatch_or_become_a_write_result_error()
    {
        using var fixture = await Fixture.ConnectAsync(true, "Light_First");
        var client = new QuickerRpcGuardedService(fixture.Proxy);
        client.Bind(QuickerRpcHostDiscovery.Verify(await fixture.Proxy.GetHostSessionAsync(), fixture.Endpoint));
        using var stop = new CancellationTokenSource(); stop.Cancel();
        var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => client.SearchFontAwesomeIconsPageAsync("", null, cancellationToken: stop.Token));
        Assert.AreEqual(stop.Token, error.CancellationToken); Assert.AreEqual(0, fixture.Target.Reads);
    }

    public class PageTarget : DispatchProxy
    {
        public QuickerRpcHostSessionInfo Info = new(); public string Name = ""; public int Reads;
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method!.Name == nameof(IQuickerRpcService.GetHostSessionAsync)) return Task.FromResult(Info);
            if (method.Name == nameof(IQuickerRpcService.SearchFontAwesomeIconsPageAsync))
            {
                Interlocked.Increment(ref Reads);
                return Task.FromResult(new QuickerRpcFontAwesomePageResult { Success = true, Names = new[] { Name, "Light_Second" },
                    Query = (string?)args![0] ?? "", Style = (string?)args[1], Skip = (int)args[2]!, Take = (int)args[3]!, TotalCount = 500, HasMore = true });
            }
            throw new AssertFailedException("No fallback or unrelated host method is allowed: " + method.Name);
        }
    }

    private sealed class Fixture : IDisposable
    {
        private readonly NamedPipeServerStream server;
        private readonly NamedPipeClientStream client;
        private readonly JsonRpc serverRpc, clientRpc;
        public string Endpoint { get; }
        public IQuickerRpcService Proxy { get; }
        public PageTarget Target { get; }
        private bool disposed;
        private Fixture(string endpoint, NamedPipeServerStream server, NamedPipeClientStream client, IQuickerRpcService inner)
        {
            Endpoint = endpoint; this.server = server; this.client = client; Target = (PageTarget)(object)inner;
            serverRpc = StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(server, new QuickerRpcGuardedService(inner, server: true));
            (clientRpc, Proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(client);
        }
        public static async Task<Fixture> ConnectAsync(bool supported, string icon)
        {
            var session = Guid.NewGuid().ToString("N"); var endpoint = QuickerRpcEndpointNames.ForSession(session);
            var server = new NamedPipeServerStream(endpoint, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            var client = new NamedPipeClientStream(".", endpoint, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                var accepting = server.WaitForConnectionAsync(stop.Token); await client.ConnectAsync(stop.Token); await accepting;
                var inner = DispatchProxy.Create<IQuickerRpcService, PageTarget>();
                var target = (PageTarget)(object)inner; target.Name = icon;
                target.Info = new() { HostSessionId = session, HostInstanceId = "fixture-" + session, Endpoint = endpoint, ProtocolVersion = 1,
                    Host = new() { Kind = "v2", QuickerVersion = "fixture" }, Capabilities = new Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead] = supported } };
                return new(endpoint, server, client, inner);
            }
            catch { client.Dispose(); server.Dispose(); throw; }
        }
        public void Dispose()
        {
            if (disposed) return; disposed = true;
            clientRpc.Dispose(); serverRpc.Dispose(); client.Dispose(); server.Dispose();
        }
    }
}
