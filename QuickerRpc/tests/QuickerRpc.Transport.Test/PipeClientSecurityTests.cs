using System;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport.Test;

[TestClass]
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
public sealed class PipeClientSecurityTests
{
    [TestMethod]
    public async Task Production_server_owner_and_protected_DACL_allow_same_user_handshake_and_binding_Async()
    {
        RequireWindows();
        using var identity = WindowsIdentity.GetCurrent();
        var user = identity.User!;
        var sessionId = Guid.NewGuid().ToString("N");
        var endpoint = QuickerRpcEndpointNames.ForSession(sessionId);
        using var server = QuickerRpcPipeServerStreamFactory.Create(endpoint);
        var security = server.GetAccessControl();
        Assert.AreEqual(user, security.GetOwner(typeof(SecurityIdentifier)));
        Assert.IsTrue(security.AreAccessRulesProtected);
        var rules = security.GetAccessRules(true, true, typeof(SecurityIdentifier));
        Assert.AreEqual(1, rules.Count);
        var rule = (PipeAccessRule)rules[0]!;
        Assert.AreEqual(user, rule.IdentityReference);
        Assert.AreEqual(AccessControlType.Allow, rule.AccessControlType);
        Assert.AreEqual(PipeAccessRights.FullControl, rule.PipeAccessRights);
        Assert.IsFalse(rule.IsInherited);

        var target = new Target(endpoint, sessionId);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepting = server.WaitForConnectionAsync(deadline.Token);
        var connecting = QuickerRpcClient.ConnectEndpointAsync(endpoint, null, deadline.Token);
        await accepting;
        using var serverRpc = StreamJsonRpcFactory.StartListeningServer(server, target);
        await using var client = await connecting;
        Assert.AreEqual(sessionId, client.Binding!.HostSessionId);
        Assert.AreEqual(endpoint, client.Binding.Endpoint);
        Assert.AreEqual("pong", await client.Rpc.PingAsync(deadline.Token));
        Assert.AreEqual(1, target.Handshakes);
        Assert.AreEqual(1, target.Pings);
        Assert.AreEqual(0, target.Writes);
    }

    [TestMethod]
    public void Owner_gate_uses_user_SID_and_rejects_other_or_unknown_owners()
    {
        RequireWindows();
        using var identity = WindowsIdentity.GetCurrent();
        var user = identity.User!;
        var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        Assert.AreNotEqual(user, administrators);
        // These are explicit SID-policy inputs, not a claim that this process is elevated.
        QuickerRpcPipeClientSecurity.RequireOwner(user, user);
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(administrators, user));
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(user, administrators));
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(null, user));
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(user, null));
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(null, null));
    }

    [TestMethod]
    public async Task Actual_connected_handle_is_checked_and_unreadable_owner_is_not_accepted_Async()
    {
        RequireWindows();
        var endpoint = "qkrpc-owner-fixture-" + Guid.NewGuid().ToString("N");
        using var server = QuickerRpcPipeServerStreamFactory.Create(endpoint);
        using var client = new NamedPipeClientStream(".", endpoint, PipeDirection.InOut, PipeOptions.Asynchronous);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepting = server.WaitForConnectionAsync(deadline.Token);
        await client.ConnectAsync(deadline.Token);
        await accepting;
        QuickerRpcPipeClientSecurity.RequireCurrentUserOwner(client);
        var actualOwner = client.GetAccessControl().GetOwner(typeof(SecurityIdentifier));
        var foreignUser = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        Assert.ThrowsException<UnauthorizedAccessException>(() => QuickerRpcPipeClientSecurity.RequireOwner(actualOwner, foreignUser));
        await client.DisposeAsync();
        Assert.ThrowsException<ObjectDisposedException>(() => QuickerRpcPipeClientSecurity.RequireCurrentUserOwner(client));
        // No RPC layer was attached to either end of this fixture.
    }

    [TestMethod]
    [TestCategory("ElevatedPipeOwner")]
    public async Task Elevated_token_rejects_token_group_owner_before_handshake_and_closes_pipe_Async()
    {
        RequireWindows();
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User == identity.Owner)
            Assert.Inconclusive("Requires an elevated token with a different default Owner. Run separately on an elevated fixture host.");
        var sessionId = Guid.NewGuid().ToString("N");
        var endpoint = QuickerRpcEndpointNames.ForSession(sessionId);
        // The client may open this owned fixture, but its server owner is not Token.User.
        var security = QuickerRpcPipeSecurity.CreateForCrossElevationPeers();
        security.SetOwner(identity.Owner!);
        using var server = NamedPipeServerStreamAcl.Create(endpoint, PipeDirection.InOut, 1,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 0, 0, security);
        Assert.AreEqual(identity.Owner, server.GetAccessControl().GetOwner(typeof(SecurityIdentifier)));
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var accepting = server.WaitForConnectionAsync(deadline.Token);
        var connecting = QuickerRpcClient.ConnectEndpointAsync(endpoint, null, deadline.Token);
        await accepting;
        var buffer = new byte[1];
        var received = server.ReadAsync(buffer, 0, buffer.Length, deadline.Token);
        await Assert.ThrowsExceptionAsync<UnauthorizedAccessException>(() => connecting);
        Assert.AreEqual(0, await received, "Rejected owners must receive no handshake or RPC bytes.");
    }

    [TestMethod]
    public async Task Already_cancelled_connection_does_not_start_handshake_Async()
    {
        RequireWindows();
        var endpoint = "qkrpc-owner-cancel-" + Guid.NewGuid().ToString("N");
        using var server = QuickerRpcPipeServerStreamFactory.Create(endpoint);
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        try
        {
            await QuickerRpcClient.ConnectEndpointAsync(endpoint, null, stop.Token);
            Assert.Fail("The cancelled connection must not succeed.");
        }
        catch (OperationCanceledException error)
        {
            Assert.AreEqual(stop.Token, error.CancellationToken);
        }
        Assert.IsFalse(server.IsConnected);
    }

    private static void RequireWindows()
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            Assert.Inconclusive("This test verifies Windows pipe ACLs. Non-Windows retains CurrentUserOnly.");
    }

    public sealed class Target
    {
        private readonly string endpoint;
        private readonly string sessionId;
        public int Handshakes;
        public int Pings;
        public int Writes;
        public Target(string endpoint, string sessionId) { this.endpoint = endpoint; this.sessionId = sessionId; }
        public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref Handshakes);
            return Task.FromResult(new QuickerRpcHostSessionInfo
            {
                HostSessionId = sessionId, HostInstanceId = "owner-fixture-" + sessionId,
                Endpoint = endpoint, ProtocolVersion = 1, Host = new() { Kind = "v2", QuickerVersion = "fixture" },
            });
        }
        public Task<string> PingAsync(CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref Pings); return Task.FromResult("pong"); }
        public Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(string id, string body,
            long? version = null, bool force = false, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref Writes); return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true }); }
    }
}
