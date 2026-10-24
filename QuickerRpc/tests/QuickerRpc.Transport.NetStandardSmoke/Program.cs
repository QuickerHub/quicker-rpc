using System.IO.Pipes;
using System.Reflection;
using System.Runtime.Versioning;
using System.Text.Json;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;

namespace QuickerRpc.Transport.NetStandardSmoke;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length != 0) throw new ArgumentException("This smoke accepts no arguments; its receipt is written to stdout.");
            if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException("This smoke requires a real Linux runtime.");
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(await RunAsync()));
            return 0;
        }
        catch (Exception error)
        {
            await Console.Error.WriteLineAsync($"{error.GetType().Name}: {error.Message}");
            return 1;
        }
    }

    private static async Task<object> RunAsync()
    {
        const string expectedFramework = ".NETStandard,Version=v2.0";
        var framework = typeof(QuickerRpcClient).Assembly.GetCustomAttribute<TargetFrameworkAttribute>()?.FrameworkName;
        Require(framework == expectedFramework, $"Expected the netstandard2.0 Transport consumer, loaded {framework ?? "an unmarked assembly"}.");

        var sessionId = Guid.NewGuid().ToString("N");
        var endpoint = QuickerRpcEndpointNames.ForSession(sessionId);
        var binding = new QuickerRpcHostBinding("netstandard-smoke-" + sessionId, sessionId, endpoint,
            1, 1, "v1", "fixture", new Dictionary<string, bool>());
        var peer = new SmokePeer(binding);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        await using var server = new NamedPipeServerStream(endpoint, PipeDirection.InOut, 1,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        var accepting = server.WaitForConnectionAsync(deadline.Token);
        var connecting = QuickerRpcClient.ConnectBoundAsync(binding, timeoutSeconds: 5, cancellationToken: deadline.Token);
        QuickerRpcClientSession? claimedClient = null;
        try
        {
            // Observe an early client rejection without leaving the owned accept pending.
            if (await Task.WhenAny(accepting, connecting) == connecting) await connecting;
            await accepting;
            using var serverRpc = StreamJsonRpcFactory.StartListeningServer(server, peer);
            await using var client = await connecting;
            claimedClient = client;
            Require(client.Binding is not null && binding.SameDestination(client.Binding)
                && client.Binding.ProtocolVersion == binding.ProtocolVersion
                && client.Binding.SchemaVersion == binding.SchemaVersion, "The connected binding did not match the generated peer.");
            var ping = await client.Rpc.PingAsync(deadline.Token);
            Require(ping == "pong", "The generated peer did not answer Ping.");
            Require(peer.Handshakes == 1 && peer.Pings == 1 && peer.Writes == 0,
                "Expected one handshake, one Ping and zero fake writes.");

            return new
            {
                format = "quicker-rpc-netstandard-consumer", version = 1, ok = true, os = "linux",
                transportTargetFramework = framework, endpoint,
                binding = new { hostInstanceId = binding.HostInstanceId, hostSessionId = binding.HostSessionId,
                    endpoint = binding.Endpoint, protocolVersion = binding.ProtocolVersion,
                    schemaVersion = binding.SchemaVersion, verified = true },
                ping, handshakes = peer.Handshakes, pings = peer.Pings, writes = peer.Writes,
            };
        }
        finally
        {
            await deadline.CancelAsync();
            await server.DisposeAsync();
            // Both tasks are owned here. Drain cancellation/failure, and dispose a
            // connection that completed before this method could claim its session.
            try { await accepting; } catch { }
            if (claimedClient is null)
            {
                try { await using var abandoned = await connecting; } catch { }
            }
        }
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}

/// <summary>Generated, read-only in-memory peer; never discovers or starts a real host.</summary>
public sealed class SmokePeer
{
    private readonly QuickerRpcHostBinding binding;
    public int Handshakes;
    public int Pings;
    public int Writes;

    public SmokePeer(QuickerRpcHostBinding binding) => this.binding = binding;

    public Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref Handshakes);
        return Task.FromResult(new QuickerRpcHostSessionInfo
        {
            HostInstanceId = binding.HostInstanceId, HostSessionId = binding.HostSessionId,
            Endpoint = binding.Endpoint, ProtocolVersion = binding.ProtocolVersion, SchemaVersion = binding.SchemaVersion,
            Host = new() { Kind = binding.HostKind, QuickerVersion = binding.QuickerVersion },
            Capabilities = new Dictionary<string, bool>(),
        });
    }

    public Task<string> PingAsync(CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref Pings);
        return Task.FromResult("pong");
    }

    public Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(string id, string body,
        long? version = null, bool force = false, CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref Writes);
        return Task.FromException<QuickerRpcApplyXActionResult>(new InvalidOperationException("The smoke peer is read-only."));
    }
}
