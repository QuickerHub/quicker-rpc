using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
public sealed class UnixPipeContractTests
{
    [TestMethod]
    [TestCategory("LinuxPipe")]
    public async Task Linux_current_user_pipe_preserves_verified_binding_and_ping_Async()
    {
        RequireLinux();
        var sessionId = Guid.NewGuid().ToString("N");
        var endpoint = QuickerRpcEndpointNames.ForSession(sessionId);
        var target = new SafeTarget(endpoint, sessionId);
        await using var server = QuickerRpcPipeServerStreamFactory.Create(endpoint);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepting = server.WaitForConnectionAsync(deadline.Token);
        var connecting = QuickerRpcClient.ConnectEndpointAsync(endpoint, null, deadline.Token);
        QuickerRpcClientSession? claimedClient = null;
        try
        {
            if (await Task.WhenAny(accepting, connecting) == connecting) await connecting;
            await accepting;
            using var serverRpc = StreamJsonRpcFactory.StartListeningServer(server, target);
            await using var client = await connecting;
            claimedClient = client;
            Assert.IsTrue(client.Pipe.IsConnected);
            var binding = client.Binding;
            Assert.IsNotNull(binding);
            Assert.AreEqual(target.Info.HostInstanceId, binding.HostInstanceId);
            Assert.AreEqual(sessionId, binding.HostSessionId);
            Assert.AreEqual(endpoint, binding.Endpoint);
            Assert.AreEqual(target.Info.ProtocolVersion, binding.ProtocolVersion);
            Assert.AreEqual(target.Info.SchemaVersion, binding.SchemaVersion);
            Assert.AreEqual(target.Info.Host.Kind, binding.HostKind);
            Assert.AreEqual(target.Info.Host.QuickerVersion, binding.QuickerVersion);
            Assert.AreEqual(2, binding.Capabilities.Count);
            Assert.IsTrue(binding.Supports(QuickerRpcHostCapabilityNames.ActionSourceRead));
            Assert.IsFalse(binding.Supports(QuickerRpcHostCapabilityNames.ActionSourceWrite));
            Assert.AreEqual("linux-fixture-pong", await client.Rpc.PingAsync(deadline.Token));
            Assert.AreEqual(1, target.Handshakes);
            Assert.AreEqual(1, target.Pings);
        }
        finally
        {
            await deadline.CancelAsync();
            await server.DisposeAsync();
            // Drain both owned tasks, including a session completed before it was claimed.
            try { await accepting; } catch { }
            if (claimedClient is null)
            {
                try { await using var abandoned = await connecting; } catch { }
            }
        }
    }

    [TestMethod]
    [TestCategory("LinuxPipe")]
    public async Task Linux_precancelled_connection_does_not_connect_or_start_handshake_Async()
    {
        RequireLinux();
        var endpoint = QuickerRpcEndpointNames.ForSession(Guid.NewGuid().ToString("N"));
        await using var server = QuickerRpcPipeServerStreamFactory.Create(endpoint);
        using var acceptStop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepting = server.WaitForConnectionAsync(acceptStop.Token);
        var acceptedConnection = false;
        using var stop = new CancellationTokenSource();
        await stop.CancelAsync();
        var connecting = QuickerRpcClient.ConnectEndpointAsync(endpoint, null, stop.Token);
        try
        {
            try
            {
                await using var unexpected = await connecting.WaitAsync(TimeSpan.FromSeconds(5));
                Assert.Fail("A precancelled connection must not succeed.");
            }
            catch (OperationCanceledException error)
            {
                Assert.AreEqual(stop.Token, error.CancellationToken);
            }
            Assert.IsFalse(server.IsConnected, "Cancellation must stop before a server connection or RPC handshake.");
        }
        finally
        {
            await acceptStop.CancelAsync();
            try { await accepting; acceptedConnection = true; }
            catch (OperationCanceledException) when (acceptStop.IsCancellationRequested) { }
            finally
            {
                await server.DisposeAsync();
                // WaitAsync only bounds its wrapper; observe and dispose any late connection.
                try { await using var abandoned = await connecting; } catch { }
            }
        }
        Assert.IsFalse(acceptedConnection, "The pending server accept must be cancelled without accepting the client.");
    }

    private static void RequireLinux()
    {
        if (!OperatingSystem.IsLinux())
            Assert.Inconclusive("Linux UID CurrentUserOnly pipe contracts are unsupported on this platform; Windows SID/ACL coverage is separate.");
    }

    // These owned same-UID peers do not claim to test rejection of another UID.
    public sealed class SafeTarget
    {
        public QuickerRpcHostSessionInfo Info { get; }
        public int Handshakes;
        public int Pings;

        public SafeTarget(string endpoint, string sessionId)
        {
            Info = new QuickerRpcHostSessionInfo
            {
                Service = "qkrpc", SchemaVersion = 1, ProtocolVersion = 1,
                HostInstanceId = "linux-pipe-fixture-" + sessionId,
                HostSessionId = sessionId, Endpoint = endpoint,
                Host = new() { Kind = "v1", QuickerVersion = "linux-fixture" },
                Capabilities = new Dictionary<string, bool>
                {
                    [QuickerRpcHostCapabilityNames.ActionSourceRead] = true,
                    [QuickerRpcHostCapabilityNames.ActionSourceWrite] = false,
                },
            };
        }

        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Interlocked.Increment(ref Handshakes);
            return Task.FromResult(Info);
        }

        public Task<string> PingAsync(CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Interlocked.Increment(ref Pings);
            return Task.FromResult("linux-fixture-pong");
        }
    }
}
