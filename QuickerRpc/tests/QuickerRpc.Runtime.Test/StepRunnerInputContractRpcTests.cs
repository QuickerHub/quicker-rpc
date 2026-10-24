using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Runtime;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class StepRunnerInputContractRpcTests
{
    private const string LegacySchema = "{\"stepRunnerKey\":\"sys:fixture\",\"inputs\":[{\"key\":\"text\"}]}";

    [TestMethod]
    public async Task Handshake_reads_only_optional_port_metadata_and_does_not_schedule_or_read_a_catalog_Async()
    {
        var port = new InputContractPort { Available = true };
        var host = new FakeHost(port);
        var scheduler = new Scheduler { RefuseScheduling = true };
        var service = Service(host, scheduler);
        var available = await service.GetHostSessionAsync();
        Assert.IsTrue(available.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
        Assert.IsFalse(available.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);
        port.Available = false;
        var unavailable = await service.GetHostSessionAsync();
        Assert.IsFalse(unavailable.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
        Assert.AreEqual(2, port.AvailabilityChecks);
        Assert.AreEqual(0, port.ContractReads);
        Assert.AreEqual(0, port.DetailReads);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task Ordinary_V1_V2_and_unknown_ports_refuse_contract_reads_without_legacy_fallback_Async()
    {
        foreach (var kind in new[] { QuickerHostKind.V1, QuickerHostKind.V2, (QuickerHostKind)999 })
        {
            var port = new LegacyPort();
            var host = new FakeHost(port) { InfoValue = new() { Kind = kind } };
            var scheduler = new Scheduler { RefuseScheduling = true };
            var service = Service(host, scheduler);
            var session = await service.GetHostSessionAsync();
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
            AssertFailure(await service.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture" }), "UNSUPPORTED_HOST");
            Assert.AreEqual(0, port.DetailReads);
            Assert.AreEqual(0, scheduler.UiCalls);
        }
    }

    [TestMethod]
    public async Task Disabled_optional_port_blocks_contract_dispatch_but_preserves_existing_get_detail_Async()
    {
        var port = new InputContractPort { Available = false };
        var scheduler = new Scheduler();
        var service = Service(new FakeHost(port), scheduler);
        AssertFailure(await service.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture" }), "UNSUPPORTED_HOST");
        Assert.AreEqual(0, scheduler.UiCalls);
        Assert.AreEqual(0, port.ContractReads);
        Assert.AreEqual(0, port.DetailReads);

        var legacy = await service.GetStepRunnerDetailAsync("sys:fixture");
        Assert.IsTrue(legacy.Success);
        Assert.AreEqual(LegacySchema, legacy.SchemaJson);
        Assert.AreEqual(1, scheduler.UiCalls);
        Assert.AreEqual(1, port.DetailReads);
        Assert.AreEqual(0, port.ContractReads);
        Assert.AreEqual(1, port.AvailabilityChecks, "Legacy detail does not probe the optional contract capability.");
    }

    [TestMethod]
    public async Task Null_or_empty_keys_fail_before_any_host_or_scheduler_access_Async()
    {
        var port = new InputContractPort { Available = true };
        var host = new FakeHost(port) { RefuseRootReads = true };
        var scheduler = new Scheduler { RefuseScheduling = true };
        var service = Service(host, scheduler);
        foreach (var request in new QuickerRpcStepRunnerInputContractRequest?[]
        {
            null, new(), new() { StepRunnerKey = null! }, new() { StepRunnerKey = "" }, new() { StepRunnerKey = " \r\n\t " },
        })
            AssertFailure(await service.GetStepRunnerInputContractAsync(request!), "INVALID_INPUT_CONTRACT_REQUEST");
        Assert.AreEqual(0, host.RootReads);
        Assert.AreEqual(0, port.AvailabilityChecks);
        Assert.AreEqual(0, port.ContractReads);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task Pre_cancellation_preserves_the_token_without_host_availability_or_dispatch_Async()
    {
        var port = new InputContractPort { Available = true };
        var host = new FakeHost(port) { RefuseRootReads = true };
        var scheduler = new Scheduler { RefuseScheduling = true };
        var service = Service(host, scheduler);
        using var stop = new CancellationTokenSource();
        await stop.CancelAsync();
        var canceled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture" }, stop.Token));
        Assert.AreEqual(stop.Token, canceled.CancellationToken);
        var handshake = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.GetHostSessionAsync(stop.Token));
        Assert.AreEqual(stop.Token, handshake.CancellationToken);
        Assert.AreEqual(0, host.RootReads);
        Assert.AreEqual(0, port.AvailabilityChecks);
        Assert.AreEqual(0, port.ContractReads);
        Assert.AreEqual(0, scheduler.UiCalls);
    }

    [TestMethod]
    public async Task Scheduled_read_uses_the_captured_port_trims_only_the_key_and_preserves_request_and_token_Async()
    {
        using var stop = new CancellationTokenSource();
        var port = new InputContractPort { Available = true };
        var other = new InputContractPort { Available = true };
        var host = new FakeHost(port);
        var scheduler = new Scheduler { BeforeInvoke = () => host.Port = other };
        var service = Service(host, scheduler);
        var expected = new QuickerRpcStepRunnerInputContractResult
        {
            Success = true,
            Contract = new() { StepRunnerKey = "sys:fixture", ControlFieldKey = "mode", AppliedControlFieldValue = " copy " },
        };
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "  sys:fixture  ", ControlFieldValue = " copy " };
        port.OnRead = (forwarded, token) =>
        {
            Assert.IsTrue(scheduler.InUiCall, "The optional port is read within the UI scheduler callback.");
            Assert.AreEqual(stop.Token, token);
            Assert.AreEqual("sys:fixture", forwarded.StepRunnerKey);
            Assert.AreEqual(" copy ", forwarded.ControlFieldValue, "Control options are exact native values, so whitespace is significant.");
            Assert.AreNotSame(request, forwarded);
            return Task.FromResult(expected);
        };

        var result = await service.GetStepRunnerInputContractAsync(request, stop.Token);
        Assert.AreSame(expected, result);
        Assert.AreEqual("  sys:fixture  ", request.StepRunnerKey);
        Assert.AreEqual(" copy ", request.ControlFieldValue);
        Assert.AreEqual(stop.Token, scheduler.LastToken);
        Assert.AreEqual(1, scheduler.UiCalls);
        Assert.AreEqual(1, host.RootReads);
        Assert.AreEqual(1, port.AvailabilityChecks);
        Assert.AreEqual(1, port.ContractReads);
        Assert.AreEqual(0, port.DetailReads);
        Assert.AreEqual(0, other.AvailabilityChecks);
        Assert.AreEqual(0, other.ContractReads, "Replacing the root port after scheduling cannot redirect the captured request.");
    }

    [TestMethod]
    public async Task Cancellation_before_native_reply_prevents_success_publication_and_preserves_the_original_token_Async()
    {
        using var stop = new CancellationTokenSource();
        var reply = new TaskCompletionSource<QuickerRpcStepRunnerInputContractResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        var port = new InputContractPort { Available = true, OnRead = (_, _) => reply.Task };
        var scheduler = new Scheduler();
        var pending = Service(new FakeHost(port), scheduler).GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture" }, stop.Token);
        Assert.AreEqual(1, port.ContractReads);
        Assert.IsFalse(pending.IsCompleted);
        await stop.CancelAsync();
        reply.SetResult(new() { Success = true, Contract = new() { StepRunnerKey = "sys:fixture" } });
        var canceled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => pending);
        Assert.AreEqual(stop.Token, canceled.CancellationToken);
        Assert.AreEqual(1, scheduler.UiCalls);
        Assert.AreEqual(1, port.ContractReads);
        Assert.AreEqual(0, port.DetailReads);
    }

    [TestMethod]
    public async Task Native_failures_and_exceptions_are_not_replaced_with_success_or_legacy_detail_Async()
    {
        var expected = new QuickerRpcStepRunnerInputContractResult
        {
            Success = false, ErrorCode = "INPUT_CONTRACT_AMBIGUOUS", ErrorMessage = "Duplicate native input keys.",
        };
        var port = new InputContractPort { Available = true, OnRead = (_, _) => Task.FromResult(expected) };
        var scheduler = new Scheduler();
        var service = Service(new FakeHost(port), scheduler);
        var request = new QuickerRpcStepRunnerInputContractRequest { StepRunnerKey = "sys:fixture" };
        Assert.AreSame(expected, await service.GetStepRunnerInputContractAsync(request));
        port.OnRead = (_, _) => throw new InvalidOperationException("native contract read failed");
        var failure = await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => service.GetStepRunnerInputContractAsync(request));
        Assert.AreEqual("native contract read failed", failure.Message);
        Assert.AreEqual(2, port.ContractReads);
        Assert.AreEqual(0, port.DetailReads);
        Assert.AreEqual(2, scheduler.UiCalls);
    }

    private static void AssertFailure(QuickerRpcStepRunnerInputContractResult result, string code)
    {
        Assert.IsFalse(result.Success);
        Assert.AreEqual(code, result.ErrorCode);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.ErrorMessage));
        Assert.IsNull(result.Contract);
    }

    private static QuickerRpcService Service(IQuickerRpcHost host, IQuickerRpcCallScheduler scheduler)
    {
        var dependencies = new QuickerRpcRuntimeDependencies(
            () => throw new AssertFailedException("Input contract dispatch must not build a legacy catalog or search index."), "fixture");
        return new(host, scheduler, new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies));
    }

    private class LegacyPort : IQuickerRpcStepRunnerHost
    {
        public int DetailReads { get; private set; }
        public Task<QuickerRpcStepRunnerDetailResult> GetDetailAsync(string key, string? controlFieldValue = null, CancellationToken cancellationToken = default)
        {
            DetailReads++;
            return Task.FromResult(new QuickerRpcStepRunnerDetailResult { Success = true, SchemaJson = LegacySchema });
        }
        public Task<QuickerRpcSearchStepRunnersResult> SearchAsync(string keyword, int? maxResults = null, CancellationToken cancellationToken = default) => throw new AssertFailedException("No legacy search fallback.");
        public Task<QuickerRpcSearchStepRunnersResult> ListAsync(int? maxResults = null, CancellationToken cancellationToken = default) => throw new AssertFailedException("No legacy list fallback.");
        public Task<QuickerRpcStepRunnerDetailResult> GetUiDetailAsync(string key, string? controlFieldValue = null, CancellationToken cancellationToken = default) => throw new AssertFailedException("No UI schema fallback.");
        public Task<QuickerRpcActionStepSummariesResult> SummarizeStepsAsync(IList<QuickerRpcActionStepSummaryInput> steps, string? embeddedSubProgramsJson = null, CancellationToken cancellationToken = default) => throw new AssertFailedException("No native summary fallback.");
    }

    private sealed class InputContractPort : LegacyPort, IQuickerRpcStepRunnerInputContractHost
    {
        public bool Available { get; set; }
        public int AvailabilityChecks { get; private set; }
        public int ContractReads { get; private set; }
        public Func<QuickerRpcStepRunnerInputContractRequest, CancellationToken, Task<QuickerRpcStepRunnerInputContractResult>>? OnRead { get; set; }
        public bool IsInputContractAvailable { get { AvailabilityChecks++; return Available; } }
        public Task<QuickerRpcStepRunnerInputContractResult> GetStepRunnerInputContractAsync(QuickerRpcStepRunnerInputContractRequest request, CancellationToken cancellationToken = default)
        {
            ContractReads++;
            return OnRead?.Invoke(request, cancellationToken)
                ?? Task.FromResult(new QuickerRpcStepRunnerInputContractResult { Success = true, Contract = new() { StepRunnerKey = request.StepRunnerKey } });
        }
    }

    private sealed class FakeHost(IQuickerRpcStepRunnerHost port) : IQuickerRpcHost
    {
        private readonly IQuickerRpcActionProgramHost programs = DispatchProxy.Create<IQuickerRpcActionProgramHost, NeverInvokePort>();
        public IQuickerRpcStepRunnerHost Port { get; set; } = port;
        public QuickerRpcHostInfo InfoValue { get; set; } = new() { Kind = QuickerHostKind.V1 };
        public bool RefuseRootReads { get; set; }
        public int RootReads { get; private set; }
        private T Check<T>(T value)
        {
            if (RefuseRootReads) throw new AssertFailedException("Invalid or canceled input contract request inspected a host port.");
            RootReads++;
            return value;
        }
        public QuickerRpcHostInfo Info => Check(InfoValue);
        public IQuickerRpcHostCapabilities Capabilities => Check<IQuickerRpcHostCapabilities>(new Flags());
        public IQuickerRpcActionProgramHost ActionPrograms => Check(programs);
        public IQuickerRpcStepRunnerHost StepRunners => Check(Port);
        public IQuickerRpcDesignerHost? Designer => Check<IQuickerRpcDesignerHost?>(null);
        public IQuickerRpcSessionHost Session => throw new AssertFailedException();
        public IQuickerRpcActionSharingHost ActionSharing => throw new AssertFailedException();
        public IQuickerRpcSubProgramHost SubPrograms => throw new AssertFailedException();
        public IQuickerRpcActionRunHost ActionRuns => throw new AssertFailedException();
        public IQuickerRpcActionCatalogHost ActionCatalog => throw new AssertFailedException();
        public IQuickerRpcSearchHost Search => throw new AssertFailedException();
        public IQuickerRpcSettingsHost Settings => throw new AssertFailedException();
        public IQuickerRpcActionDocHost ActionDocs => throw new AssertFailedException();
        public IQuickerRpcExpressionHost Expressions => throw new AssertFailedException();
        public IQuickerRpcChromeControlHost? ChromeControl => null;
        public IQuickerRpcTriggerHost? Triggers => null;
        public IQuickerRpcLauncherHost? Launcher => null;
    }

    public class NeverInvokePort : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => throw new AssertFailedException("Unexpected native call: " + targetMethod?.Name);
    }

    private sealed class Flags : IQuickerRpcHostCapabilities
    {
        public bool DesignerUi => false;
        public bool EnforcesDesignerOpenGuard => false;
        public bool ChromeControl => false;
        public bool Triggers => false;
        public bool Launcher => false;
    }

    private sealed class Scheduler : IQuickerRpcCallScheduler
    {
        public bool RefuseScheduling { get; set; }
        public bool InUiCall { get; private set; }
        public int UiCalls { get; private set; }
        public CancellationToken LastToken { get; private set; }
        public Action? BeforeInvoke { get; set; }
        public async Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default)
        {
            if (RefuseScheduling) throw new AssertFailedException("Metadata, invalid or unsupported requests must not be scheduled.");
            UiCalls++;
            LastToken = cancellationToken;
            BeforeInvoke?.Invoke();
            InUiCall = true;
            try { return await action(); }
            finally { InUiCall = false; }
        }
        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) => throw new AssertFailedException("Input contract reads must use the UI scheduler.");
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => throw new AssertFailedException("Input contract reads must use the async UI scheduler.");
    }

    private sealed class NoFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) => throw new AssertFailedException();
        public void Error(string message) => throw new AssertFailedException();
    }
}
