using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Console.Mcp;
using QuickerRpc.Console.Serve;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Testing;
using QuickerRpc.Transport;
using StreamJsonRpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class SourceSaveEntryPointTests
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), "qkrpc-source-save-entry-" + Guid.NewGuid().ToString("N"));
    private const string Id = "c48202e2-e309-4723-9d2a-7a83a29b38fb";

    [TestCleanup]
    public void Cleanup() { if (Directory.Exists(directory)) Directory.Delete(directory, true); }

    [DataTestMethod]
    [DataRow(false)]
    [DataRow(true)]
    public async Task CLI_and_serve_reuse_the_preconnection_prepared_snapshot_when_source_changes_during_handshake(bool cli)
    {
        // Generated current-user pipe and fake DTOs only. No discovery, native host or TCP listener.
        await using var host = new GatedSourceHost();
        ActionSourceWorkspace.Open(directory, Id, 7, "fixture", "catalog", new JObject {
            ["Steps"] = new JArray(), ["Variables"] = new JArray(new JObject {
                ["Key"] = "message", ["VarType"] = 0, ["DefaultValue"] = "before" }), ["SubPrograms"] = new JArray() },
            hostBinding: host.Binding);
        var prepared = ActionSourceWorkspace.Prepare(directory);
        await using var pool = new QkrpcRpcSessionPool(3, false);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var saving = cli ? Cli(prepared.SnapshotRevision, stop.Token) : Serve(pool, prepared.SnapshotRevision, stop.Token);
        try
        {
            await host.HandshakeEntered.Task.WaitAsync(stop.Token);
            var source = Path.Combine(directory, ActionSourceWorkspace.SourceFile);
            var late = File.ReadAllText(source).Replace("before", "after", StringComparison.Ordinal);
            File.WriteAllText(source, late);
            host.ReleaseHandshake.TrySetResult();
            using var receipt = JsonDocument.Parse(await saving.WaitAsync(stop.Token));
            Assert.IsTrue(receipt.RootElement.GetProperty("ok").GetBoolean(), receipt.RootElement.ToString());
            var data = receipt.RootElement.GetProperty("data");
            Assert.AreEqual(prepared.SnapshotRevision, data.GetProperty("consumedSnapshot").GetString());
            Assert.AreEqual(prepared.ConsumedBodyHash, data.GetProperty("consumedBodyHash").GetString());
            Assert.AreEqual(1, host.Writes);
            Assert.AreEqual(prepared.EditableBodyJson, host.Body);
            Assert.AreEqual(late, File.ReadAllText(source));
            var current = ActionSourceWorkspace.Prepare(directory);
            Assert.AreEqual(8L, current.EditVersion);
            Assert.AreNotEqual(prepared.ConsumedBodyHash, current.ConsumedBodyHash);
        }
        finally
        {
            stop.Cancel();
            try { await saving; } catch { /* Await retained operation/child cleanup even when the assertion failed. */ }
        }
    }

    private async Task<string> Serve(QkrpcRpcSessionPool pool, string snapshot, CancellationToken token)
    {
        var response = await ServeInvokeDispatcher.InvokeAsync(pool, "action.save", JsonSerializer.SerializeToElement(new {
            dir = directory, expectedSnapshot = snapshot, dryRun = false }), 3, token, null,
            _ => throw new AssertFailedException("Bound source save attempted discovery."));
        return JsonSerializer.Serialize(response, QkrpcJson.CliOutput);
    }

    private async Task<string> Cli(string snapshot, CancellationToken token)
    {
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true,
            RedirectStandardError = true, CreateNoWindow = true };
        start.ArgumentList.Add(typeof(QkrpcMcpRuntime).Assembly.Location);
        foreach (var arg in new[] { "action", "save", "--dir", directory, "--expected-source-snapshot", snapshot,
            "--timeout", "3", "--no-bootstrap", "--json" }) start.ArgumentList.Add(arg);
        start.Environment.Remove("QKRPC_HOST_BINDING"); start.Environment.Remove("QKRPC_HOST_SESSION");
        using var child = Process.Start(start)!;
        var stdout = child.StandardOutput.ReadToEndAsync(); var stderr = child.StandardError.ReadToEndAsync();
        try
        {
            await child.WaitForExitAsync(token);
            var output = await stdout; var error = await stderr;
            Assert.AreEqual(0, child.ExitCode, output + error);
            return output;
        }
        finally { if (!child.HasExited) { child.Kill(entireProcessTree: true); await child.WaitForExitAsync(); } }
    }

    private sealed class GatedSourceHost : IAsyncDisposable
    {
        private readonly NamedPipeServerStream pipe;
        private readonly CancellationTokenSource stop = new();
        private readonly Task accepting;
        private JsonRpc? rpc;
        internal TaskCompletionSource HandshakeEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource ReleaseHandshake { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal QuickerRpcHostBinding Binding { get; }
        internal QuickerRpcHostSessionInfo Info { get; }
        internal int Writes;
        internal string? Body;

        internal GatedSourceHost()
        {
            var session = Guid.NewGuid().ToString("N");
            var endpoint = QuickerRpcEndpointNames.ForSession(session);
            Info = new QuickerRpcHostSessionInfo { HostInstanceId = "gated-source-fixture", HostSessionId = session,
                Endpoint = endpoint, ProtocolVersion = 1, Host = new() { Kind = "v1", QuickerVersion = "synthetic" },
                Capabilities = new Dictionary<string, bool> { [QuickerRpcHostCapabilityNames.ActionSourceWrite] = true } };
            Binding = new QuickerRpcHostBinding(Info.HostInstanceId, session, endpoint, 1, 1,
                Info.Host.Kind, Info.Host.QuickerVersion, new Dictionary<string, bool>(Info.Capabilities));
            pipe = CurrentUserPipeFixture.Create(endpoint);
            accepting = Accept();
        }

        private async Task Accept()
        {
            try
            {
                await pipe.WaitForConnectionAsync(stop.Token);
                rpc = StreamJsonRpcFactory.StartListeningServer(pipe, new Target(this));
            }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        }

        public async ValueTask DisposeAsync()
        {
            stop.Cancel(); ReleaseHandshake.TrySetCanceled();
            await accepting;
            rpc?.Dispose(); pipe.Dispose(); stop.Dispose();
        }

        private sealed class Target(GatedSourceHost owner)
        {
            public Task<string> PingAsync(CancellationToken cancellationToken = default) => Task.FromResult("pong");
            public Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default) => Task.FromResult(1);
            public async Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
            {
                owner.HandshakeEntered.TrySetResult();
                await owner.ReleaseHandshake.Task.WaitAsync(cancellationToken);
                return owner.Info;
            }
            public Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(string id, string body, long? version,
                bool force, CancellationToken cancellationToken = default)
            {
                Interlocked.Increment(ref owner.Writes); owner.Body = body;
                return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, Persisted = true, ActionId = id,
                    EditVersion = (version ?? 7) + 1 });
            }
        }
    }
}
