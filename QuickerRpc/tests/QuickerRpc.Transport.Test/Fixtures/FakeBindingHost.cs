using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Transport;
using StreamJsonRpc;

namespace QuickerRpc.Testing;

/// <summary>Owns only generated pipe names and fake in-memory data; never discovers a real host.</summary>
public sealed class FakeBindingHost : IAsyncDisposable
{
    private readonly CancellationTokenSource stop = new();
    private readonly List<JsonRpc> connections = new();
    private readonly Task loop;
    private readonly object target;
    private readonly NamedPipeServerStream first;
    public string SessionId { get; } = Guid.NewGuid().ToString("N");
    public string Endpoint { get; }
    public QuickerRpcHostSessionInfo Info { get; }
    public int Writes;
    public int StorageWrites;
    public int Handshakes;
    public int LegacyReads;
    public int MetadataWrites;
    public string LegacyBodyJson = "{\"steps\":[],\"variables\":[],\"subPrograms\":[]}";
    public bool DropAfterWrite;
    public Func<string, long?, QuickerRpcApplyXActionResult>? Apply;
    public Func<string, QuickerRpcActionStorageIdentity, long?, bool, QuickerRpcApplyXActionResult>? ApplyWithStorage;
    public Func<CancellationToken, Task<QuickerRpcApplyXActionResult>>? AsyncApply;
    public int HandshakeDelayMilliseconds;
    public string BodyJson = "{\"Steps\":[],\"Variables\":[],\"SubPrograms\":[]}";
    public QuickerRpcActionStorageIdentity? StorageIdentity;

    public FakeBindingHost(string kind = "v1", bool source = true, bool legacy = false, bool storage = true)
    {
        Endpoint = QuickerRpcEndpointNames.ForSession(SessionId);
        Info = new QuickerRpcHostSessionInfo
        {
            HostSessionId = SessionId, HostInstanceId = "fixture-" + Guid.NewGuid().ToString("N"), Endpoint = Endpoint,
            ProtocolVersion = 1, Host = new() { Kind = kind, QuickerVersion = kind + ".fixture" },
            Capabilities = new Dictionary<string, bool>
            {
                [QuickerRpcHostCapabilityNames.ActionSourceRead] = source,
                [QuickerRpcHostCapabilityNames.ActionSourceWrite] = source,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyRead] = true,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite] = true,
                [QuickerRpcHostCapabilityNames.ActionLegacyBodyPatch] = true,
                [QuickerRpcHostCapabilityNames.ActionPresentationWrite] = true,
            },
        };
        target = legacy ? new LegacyTarget(this) : storage ? new StorageTarget(this) : new Target(this);
        first = NewPipe();
        loop = RunAsync();
    }

    public QuickerRpcHostBinding Binding => new(Info.HostInstanceId, Info.HostSessionId, Endpoint, 1, 1,
        Info.Host.Kind, Info.Host.QuickerVersion, new Dictionary<string, bool>(Info.Capabilities));

    private NamedPipeServerStream NewPipe() => new(Endpoint, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances,
        PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);

    private async Task RunAsync()
    {
        NamedPipeServerStream? next = first;
        try
        {
            while (!stop.IsCancellationRequested)
            {
                var pipe = next;
                await pipe.WaitForConnectionAsync(stop.Token);
                var rpc = StreamJsonRpcFactory.StartListeningServer(pipe, target);
                lock (connections) connections.Add(rpc);
                next = NewPipe();
            }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
        finally { next?.Dispose(); }
    }

    public void Disconnect()
    {
        lock (connections) foreach (var rpc in connections) rpc.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        stop.Cancel();
        Disconnect();
        await loop;
        stop.Dispose();
    }

    public class LegacyTarget
    {
        protected readonly FakeBindingHost owner;
        public LegacyTarget(FakeBindingHost owner) { this.owner = owner; }
        public Task<string> PingAsync(CancellationToken cancellationToken = default) => Task.FromResult("pong");
        public Task<int> GetProtocolVersionAsync(CancellationToken cancellationToken = default) => Task.FromResult(1);
        public Task<QuickerRpcGetCompressedActionResult> GetCompressedActionByIdAsync(string id, string? returnMode = null, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.LegacyReads);
            return Task.FromResult(new QuickerRpcGetCompressedActionResult { Success = true, ActionId = id, EditVersion = 7,
                CompressedJson = returnMode == "metadata" ? System.Text.Json.JsonSerializer.Serialize(new { id, title = "Fixture", editVersion = 7 }) : owner.LegacyBodyJson });
        }
        public Task<QuickerRpcApplyXActionResult> ApplyXActionToActionAsync(string id, string body, long? version = null, bool force = false, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.Writes);
            return Task.FromResult(new QuickerRpcApplyXActionResult { Success = true, ActionId = id, EditVersion = (version ?? 7) + 1 });
        }
        public Task<QuickerRpcUpdateActionMetadataResult> UpdateActionMetadataAsync(string id, string? title = null, string? description = null,
            string? icon = null, string? contextMenuData = null, long? version = null, bool force = false, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.MetadataWrites);
            if (owner.DropAfterWrite) owner.Disconnect();
            return Task.FromResult(new QuickerRpcUpdateActionMetadataResult { Success = true, ActionId = id, EditVersion = (version ?? 7) + 1,
                Title = title, Description = description, Icon = icon, ContextMenuData = contextMenuData });
        }
        public Task<QuickerRpcGetActionProgramSourceResult> GetActionProgramSourceAsync(string id, CancellationToken cancellationToken = default) =>
            Task.FromResult(new QuickerRpcGetActionProgramSourceResult { Success = true, ActionId = id,
                EditVersion = owner.StorageIdentity?.Version ?? 7, StorageIdentity = owner.StorageIdentity, BodyJson = owner.BodyJson });
        public async Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceAsync(string id, string body, long? version, bool force, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.Writes);
            if (owner.AsyncApply is not null) return await owner.AsyncApply(cancellationToken);
            if (owner.DropAfterWrite)
            {
                owner.Disconnect();
                return new QuickerRpcApplyXActionResult { Success = true };
            }
            return owner.Apply?.Invoke(id, version)
                ?? new QuickerRpcApplyXActionResult { Success = true, ActionId = id, EditVersion = (version ?? 7) + 1 };
        }
        public Task<QuickerRpcSearchStepRunnersResult> SearchStepRunnersAsync(string query, int? maxResults = null, CancellationToken cancellationToken = default) =>
            Task.FromResult(new QuickerRpcSearchStepRunnersResult { Success = true, Keyword = owner.Info.Host.Kind });
        public Task<QuickerRpcActionRunResult> RunActionAsync(string id, string? param = null, bool enableDebugging = false, bool waitForComplete = false, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref owner.Writes); return Task.FromResult(new QuickerRpcActionRunResult()); }
        public Task<QuickerRpcActionTraceRunResult> RunActionTraceAsync(string id, string? param = null,
            IProgress<QuickerRpcActionTraceEvent>? progress = null, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref owner.Writes); return Task.FromResult(new QuickerRpcActionTraceRunResult()); }
    }

    public class Target : LegacyTarget
    {
        public Target(FakeBindingHost owner) : base(owner) { }
        public async Task<QuickerRpcHostSessionInfo> GetHostSessionAsync(CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.Handshakes);
            if (owner.HandshakeDelayMilliseconds > 0) await Task.Delay(owner.HandshakeDelayMilliseconds, cancellationToken);
            return owner.Info;
        }
    }

    public sealed class StorageTarget : Target
    {
        public StorageTarget(FakeBindingHost owner) : base(owner) { }
        public async Task<QuickerRpcApplyXActionResult> ApplyActionProgramSourceWithStorageAsync(string id, string body,
            QuickerRpcActionStorageIdentity storageIdentity, long? version = null, bool force = false,
            CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref owner.StorageWrites);
            if (owner.ApplyWithStorage is not null)
            {
                Interlocked.Increment(ref owner.Writes);
                return owner.ApplyWithStorage(id, storageIdentity, version, force);
            }
            return await ApplyActionProgramSourceAsync(id, body, version, force, cancellationToken);
        }
    }
}
