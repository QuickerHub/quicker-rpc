using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class ActionProgramSourceRpcTests
{
    private const string NativeBody = "{\"steps\":[{\"stepRunnerKey\":\"custom:future\",\"unknownStepField\":{\"null\":null,\"bool\":true}}],\"variables\":[{\"key\":\"v\",\"futureVariableField\":42}],\"subPrograms\":[{\"futureSubprogramField\":\"value\"}],\"futureRootField\":[1,2,3]}";

    [TestMethod]
    public async Task SourceRead_preserves_complete_native_body_and_catalog_identity()
    {
        var host = new SourceHost();
        var scheduler = new Scheduler();
        host.Source.ReadResult = new QuickerRpcGetActionProgramSourceResult
        {
            Success = true,
            ActionId = "action-1",
            EditVersion = 123,
            BodyJson = NativeBody,
            ReadSource = "catalog",
            Title = "Saved title",
            Warnings = new[] { "Action Designer is open; this is the catalog body." },
        };

        var result = await CreateService(host, scheduler).GetActionProgramSourceAsync(" action-1 ");

        Assert.IsTrue(result.Success);
        Assert.AreEqual(NativeBody, result.BodyJson);
        Assert.AreEqual("catalog", result.ReadSource);
        Assert.AreEqual(123L, result.EditVersion);
        Assert.AreEqual("Saved title", result.Title);
        Assert.AreEqual(1, result.Warnings.Count);
        Assert.AreEqual("action-1", host.Source.LastId);
        Assert.AreEqual(1, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task SourceWrite_preserves_native_json_and_version_check_in_one_ui_dispatch()
    {
        var host = new SourceHost();
        var scheduler = new Scheduler();
        using var cancellation = new CancellationTokenSource();

        var result = await CreateService(host, scheduler).ApplyActionProgramSourceAsync(
            " action-1 ", NativeBody, 123, cancellationToken: cancellation.Token);

        Assert.IsTrue(result.Success);
        Assert.AreEqual(NativeBody, host.Source.LastBody);
        Assert.AreEqual(123L, host.Source.LastExpectedVersion);
        Assert.IsFalse(host.Source.LastForce);
        Assert.AreEqual(cancellation.Token, host.Source.LastCancellation);
        Assert.AreEqual(1, scheduler.UiCalls);
        Assert.AreEqual(1, host.Source.Writes);
    }

    [TestMethod]
    public async Task SourceWrite_rejects_invalid_program_or_missing_version_before_calling_host()
    {
        var host = new SourceHost();
        var scheduler = new Scheduler();
        var service = CreateService(host, scheduler);
        var missingVersion = await service.ApplyActionProgramSourceAsync("action-1", NativeBody);
        Assert.AreEqual("MISSING_EDIT_VERSION", missingVersion.ErrorCode);

        foreach (var invalid in new[] { "not json", "[]", "{\"steps\":[],\"variables\":{}}", "{\"steps\":[],\"variables\":[],\"subPrograms\":null}" })
        {
            var result = await service.ApplyActionProgramSourceAsync("action-1", invalid, 123);
            Assert.AreEqual("INVALID_PROGRAM", result.ErrorCode, invalid);
        }

        Assert.AreEqual(0, host.Source.Writes);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task SourceWrite_preserves_conflict_and_designer_protection_even_with_force()
    {
        var host = new SourceHost();
        var service = CreateService(host, new Scheduler());
        host.Source.WriteResult = new QuickerRpcApplyXActionResult
        {
            ErrorCode = "VERSION_CONFLICT",
            ErrorMessage = "Re-read source.",
            VersionConflict = true,
            EditVersion = 456,
        };
        var conflict = await service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123);
        Assert.AreEqual("VERSION_CONFLICT", conflict.ErrorCode);
        Assert.AreEqual(456L, conflict.EditVersion);
        Assert.AreEqual(true, conflict.VersionConflict);

        host.Source.WriteResult = new QuickerRpcApplyXActionResult { ErrorCode = "DESIGNER_OPEN" };
        var designer = await service.ApplyActionProgramSourceAsync("action-1", NativeBody, force: true);
        Assert.IsTrue(host.Source.LastForce);
        Assert.IsFalse(designer.Success);
        Assert.AreEqual("DESIGNER_OPEN", designer.ErrorCode);
    }

    [DataTestMethod]
    [DataRow(QuickerHostKind.V1)]
    [DataRow(QuickerHostKind.V2)]
    public async Task SourceOperations_reject_hosts_without_source_port(QuickerHostKind kind)
    {
        var host = new SourceHost { Info = new() { Kind = kind }, SupportsSourcePort = false };
        var scheduler = new Scheduler();
        var service = CreateService(host, scheduler);

        var read = await service.GetActionProgramSourceAsync("action-1");
        var write = await service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123);

        Assert.AreEqual("UNSUPPORTED_HOST", read.ErrorCode);
        Assert.AreEqual("UNSUPPORTED_HOST", write.ErrorCode);
        Assert.AreEqual(0, host.Source.Reads);
        Assert.AreEqual(0, host.Source.Writes);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task SourceOperations_use_available_port_independently_of_host_kind()
    {
        var host = new SourceHost { Info = new() { Kind = QuickerHostKind.V2 } };
        var service = CreateService(host, new Scheduler());

        Assert.IsTrue((await service.GetActionProgramSourceAsync("action-1")).Success);
        Assert.IsTrue((await service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123)).Success);
        Assert.AreEqual(1, host.Source.Reads);
        Assert.AreEqual(1, host.Source.Writes);
    }

    [TestMethod]
    public async Task SourceOperations_reject_unavailable_native_storage_before_dispatch()
    {
        var host = new SourceHost();
        host.Source.IsProgramSourceAvailable = false;
        var scheduler = new Scheduler();
        var service = CreateService(host, scheduler);
        Assert.AreEqual("UNSUPPORTED_HOST", (await service.GetActionProgramSourceAsync("action-1")).ErrorCode);
        Assert.AreEqual("UNSUPPORTED_HOST", (await service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123)).ErrorCode);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task Cancelled_source_operations_never_reach_host()
    {
        var host = new SourceHost();
        var service = CreateService(host, new Scheduler());
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.GetActionProgramSourceAsync("action-1", cancellation.Token));
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123, cancellationToken: cancellation.Token));
        Assert.AreEqual(0, host.Source.Reads);
        Assert.AreEqual(0, host.Source.Writes);
    }

    [TestMethod]
    public async Task Storage_source_write_uses_distinct_optional_port_and_preserves_identity_and_cancellation()
    {
        var source = new StorageSourcePort();
        var host = new SourceHost { Source = source };
        var scheduler = new Scheduler();
        var service = CreateService(host, scheduler);
        using var cancellation = new CancellationTokenSource();
        var identity = new QuickerRpcActionStorageIdentity { Kind = "draft", DraftId = "fixture", Version = 123, ContentHash = "hash" };
        var result = await service.ApplyActionProgramSourceWithStorageAsync(" action-1 ", NativeBody, identity, 123, cancellationToken: cancellation.Token);
        Assert.IsTrue(result.Success);
        Assert.AreSame(identity, source.LastStorageIdentity);
        Assert.AreEqual(cancellation.Token, source.LastCancellation);
        Assert.AreEqual("action-1", source.LastId);
        Assert.AreEqual(1, source.Writes);
        Assert.AreEqual(1, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task Identity_bound_write_never_falls_back_to_legacy_source_port()
    {
        var host = new SourceHost(); // Original V1 adapter contract only.
        var scheduler = new Scheduler();
        var service = CreateService(host, scheduler);
        var identity = new QuickerRpcActionStorageIdentity { Version = 123 };
        var result = await service.ApplyActionProgramSourceWithStorageAsync("action-1", NativeBody, identity, 123);
        Assert.AreEqual("UNSUPPORTED_HOST", result.ErrorCode);
        Assert.AreEqual(0, host.Source.Writes);
        Assert.AreEqual(0, scheduler.UiCalls);
        Assert.AreEqual("STORAGE_IDENTITY_REQUIRED", (await service.ApplyActionProgramSourceWithStorageAsync("action-1", NativeBody, null!, 123)).ErrorCode);
        Assert.IsTrue((await service.ApplyActionProgramSourceAsync("action-1", NativeBody, 123, false, CancellationToken.None)).Success);
        Assert.AreEqual(1, host.Source.Writes);
    }

    [TestMethod]
    public void Legacy_source_CLR_signatures_remain_exact_and_new_RPC_name_is_unambiguous()
    {
        var signature = new[] { typeof(string), typeof(string), typeof(long?), typeof(bool), typeof(CancellationToken) };
        Assert.IsNotNull(typeof(IQuickerRpcService).GetMethod(nameof(IQuickerRpcService.ApplyActionProgramSourceAsync), signature));
        Assert.IsNotNull(typeof(QuickerRpcService).GetMethod(nameof(QuickerRpcService.ApplyActionProgramSourceAsync), signature));
        Assert.IsNotNull(typeof(IQuickerRpcActionProgramSourceHost).GetMethod(nameof(IQuickerRpcActionProgramSourceHost.ApplyProgramSourceAsync), signature));
        Assert.AreEqual(1, typeof(IQuickerRpcService).GetMethods().Count(method => method.Name == nameof(IQuickerRpcService.ApplyActionProgramSourceAsync)));
        Assert.AreEqual(1, typeof(IQuickerRpcService).GetMethods().Count(method => method.Name == nameof(IQuickerRpcService.ApplyActionProgramSourceWithStorageAsync)));
    }

    private static QuickerRpcService CreateService(SourceHost host, Scheduler scheduler)
    {
        var deps = new QuickerRpcRuntimeDependencies(() => new StepRunnerCatalog(), "catalog");
        return new QuickerRpcService(host, scheduler, new Feedback(), new ActionProgramRpcHandler(deps), new SubProgramRpcHandler(deps));
    }

    private class SourcePort : ProgramPort, IQuickerRpcActionProgramSourceHost, IQuickerRpcActionProgramSourceAvailability
    {
        public bool IsProgramSourceAvailable { get; set; } = true;
        public QuickerRpcGetActionProgramSourceResult ReadResult { get; set; } = new() { Success = true };
        public QuickerRpcApplyXActionResult WriteResult { get; set; } = new() { Success = true };
        public int Reads { get; private set; }
        public int Writes { get; private set; }
        public string? LastId { get; private set; }
        public string? LastBody { get; private set; }
        public long? LastExpectedVersion { get; private set; }
        public bool LastForce { get; private set; }
        public CancellationToken LastCancellation { get; private set; }

        public Task<QuickerRpcGetActionProgramSourceResult> GetProgramSourceAsync(string actionId, CancellationToken cancellationToken = default)
        {
            Reads++;
            LastId = actionId;
            return Task.FromResult(ReadResult);
        }

        public Task<QuickerRpcApplyXActionResult> ApplyProgramSourceAsync(string actionId, string bodyJson, long? expectedEditVersion, bool force, CancellationToken cancellationToken = default)
        {
            Writes++;
            LastId = actionId;
            LastBody = bodyJson;
            LastExpectedVersion = expectedEditVersion;
            LastForce = force;
            LastCancellation = cancellationToken;
            return Task.FromResult(WriteResult);
        }

    }

    private sealed class StorageSourcePort : SourcePort, IQuickerRpcActionProgramSourceStorageHost
    {
        public QuickerRpcActionStorageIdentity? LastStorageIdentity { get; private set; }
        public Task<QuickerRpcApplyXActionResult> ApplyProgramSourceWithStorageAsync(string actionId, string bodyJson,
            QuickerRpcActionStorageIdentity storageIdentity, long? expectedEditVersion, bool force, CancellationToken cancellationToken = default)
        {
            LastStorageIdentity = storageIdentity;
            return ApplyProgramSourceAsync(actionId, bodyJson, expectedEditVersion, force, cancellationToken);
        }
    }

    private class ProgramPort : IQuickerRpcActionProgramHost
    {
        public Task<QuickerRpcActionProgramSnapshot?> TryGetProgramAsync(string actionId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<QuickerRpcActionProgramWriteResult> TryWriteProgramBodyAsync(QuickerRpcActionProgramBodyWrite write, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<QuickerRpcActionProgramWriteResult> TryUpdatePresentationAsync(QuickerRpcActionPresentationWrite write, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<QuickerRpcApplyActionPatchResult> TryApplyPatchAsync(string actionId, string patchJson, long? expectedEditVersion, bool force, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class SourceHost : IQuickerRpcHost
    {
        public SourcePort Source { get; set; } = new();
        public bool SupportsSourcePort { get; set; } = true;
        public QuickerRpcHostInfo Info { get; set; } = new() { Kind = QuickerHostKind.V1 };
        public IQuickerRpcActionProgramHost ActionPrograms => SupportsSourcePort ? Source : new ProgramPort();
        public IQuickerRpcHostCapabilities Capabilities => throw new NotSupportedException();
        public IQuickerRpcSessionHost Session => throw new NotSupportedException();
        public IQuickerRpcActionSharingHost ActionSharing => throw new NotSupportedException();
        public IQuickerRpcSubProgramHost SubPrograms => throw new NotSupportedException();
        public IQuickerRpcActionRunHost ActionRuns => throw new NotSupportedException();
        public IQuickerRpcActionCatalogHost ActionCatalog => throw new NotSupportedException();
        public IQuickerRpcSearchHost Search => throw new NotSupportedException();
        public IQuickerRpcSettingsHost Settings => throw new NotSupportedException();
        public IQuickerRpcActionDocHost ActionDocs => throw new NotSupportedException();
        public IQuickerRpcStepRunnerHost StepRunners => throw new NotSupportedException();
        public IQuickerRpcExpressionHost Expressions => throw new NotSupportedException();
        public IQuickerRpcChromeControlHost? ChromeControl => null;
        public IQuickerRpcTriggerHost? Triggers => null;
        public IQuickerRpcDesignerHost? Designer => null;
        public IQuickerRpcLauncherHost? Launcher => null;
    }

    private sealed class Scheduler : IQuickerRpcCallScheduler
    {
        public int UiCalls { get; private set; }
        public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default)
        {
            UiCalls++;
            return action();
        }

        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) => throw new AssertFailedException("Source operations must share one UI dispatch with their guards.");
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => action();
    }

    private sealed class Feedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) { }
        public void Error(string message) { }
    }
}
