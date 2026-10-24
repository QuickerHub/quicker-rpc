using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Runtime.Test;

[TestClass, DoNotParallelize]
public sealed class V2StepRunnerInputContractTests
{
    [TestInitialize]
    public void Reset() { Storage.Current = new NativeService(); Storage.Probes = 0; }

    private static V2StepRunnerInputContractNativePort.Binding Binding() =>
        V2StepRunnerInputContractNativePort.Binding.TryCreate(typeof(Storage), typeof(INativeService), typeof(Runner))!;
    private static V2StepRunnerInputContractNativePort Native(Func<Func<StepRunnerCatalog>, CancellationToken, Task<StepRunnerCatalog>>? dispatch = null) =>
        new(() => Binding(), () => true, dispatch ?? ((work, _) => Task.FromResult(work())));
    private static V2StepRunnerHost Host(IV2StepRunnerInputContractNativePort? native = null) => new(
        new V2HeadlessActionProgramService(() => throw new AssertFailedException("No legacy catalog fallback"), () => true), new NoSummaries(), native ?? Native());
    private static Task<QuickerRpcStepRunnerInputContractResult> ReadAsync(V2StepRunnerHost host, string? control = null, CancellationToken token = default) =>
        host.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture", ControlFieldValue = control }, token);

    [TestMethod]
    public async Task Availability_only_reads_existing_owner_metadata_and_refuses_missing_or_old_native_portsAsync()
    {
        var native = Native();
        Assert.IsTrue(native.IsAvailable); Assert.IsTrue(Host(native).IsInputContractAvailable);
        Assert.AreEqual(0, Storage.Current!.Reads); Assert.IsTrue(Storage.Probes > 0);
        Storage.Current = null;
        Assert.IsFalse(native.IsAvailable);
        Assert.AreEqual("UNSUPPORTED_HOST", (await ReadAsync(Host(native))).ErrorCode);
        Assert.IsNull(V2StepRunnerInputContractNativePort.Binding.TryCreate(typeof(OldStorage), typeof(INativeService), typeof(Runner)));
        Assert.IsFalse(new V2StepRunnerInputContractNativePort(() => Binding(), () => false, (_, _) => throw new AssertFailedException()).IsAvailable);
        Assert.IsFalse(new V2StepRunnerInputContractNativePort().IsAvailable);
        Assert.IsNull(System.Windows.Application.Current);
        await Assert.ThrowsExceptionAsync<NotSupportedException>(() => V2StepRunnerInputContractNativePort.DispatchAsync(() => new(), default));
    }

    [TestMethod]
    public async Task A_fresh_native_definition_is_dispatched_for_each_read_without_using_the_cached_catalogAsync()
    {
        var native = Native((work, _) => { Storage.Current!.InDispatcher = true; try { return Task.FromResult(work()); } finally { Storage.Current.InDispatcher = false; } });
        Storage.Current!.RequireDispatcher = true;
        var host = Host(native);
        var first = await ReadAsync(host);
        Assert.IsTrue(first.Success, first.ErrorMessage); Assert.AreEqual("v2", first.Contract!.HostKind); Assert.AreEqual("runtime-definition", first.Contract.Source);
        Assert.AreEqual("allowed", first.Contract.Inputs.Single().LiteralPolicy);
        ((Input)Storage.Current.Definition.InputParams[0]).VariableMode = Mode.UseVarOnly;
        var second = await ReadAsync(host);
        Assert.AreEqual("existing-nonempty-literal-only", second.Contract!.Inputs.Single().LiteralPolicy);
        Assert.AreEqual(2, Storage.Current.Reads);
        Assert.IsNull(first.Contract.ControlFieldKey); Assert.IsNull(first.Contract.AppliedControlFieldValue);
        Assert.AreEqual("STEP_RUNNER_NOT_FOUND", (await host.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "missing" })).ErrorCode);
    }

    [TestMethod]
    public async Task Null_control_uses_only_the_proven_default_while_empty_is_a_distinct_exact_optionAsync()
    {
        var control = new Input { Key = "mode", Type = NativeType.Enum, VariableMode = Mode.Input, IsControlField = true,
            DefaultValue = "copy", SelectionItems = [new("copy"), new("")] };
        Storage.Current!.Definition.InputParams = [control, new Input { Key = "text", ValidForList = ["copy"] }];
        var host = Host();
        var defaults = (await ReadAsync(host)).Contract!;
        Assert.AreEqual("copy", defaults.AppliedControlFieldValue); Assert.IsTrue(defaults.Inputs[1].Visible);
        var empty = (await ReadAsync(host, "")).Contract!;
        Assert.AreEqual("", empty.AppliedControlFieldValue); Assert.IsFalse(empty.Inputs[1].Visible);
        Assert.AreEqual("INVALID_CONTROL_FIELD_VALUE", (await ReadAsync(host, " copy ")).ErrorCode);
        control.DefaultValue = null;
        var unknown = (await ReadAsync(host)).Contract!;
        Assert.IsNull(unknown.AppliedControlFieldValue); Assert.IsFalse(unknown.VisibilityResolved); Assert.IsFalse(unknown.Inputs[1].VisibilityResolved);
        Assert.IsFalse(defaults.Inputs[0].LiteralPolicy == "allowed", "Control fields never become input-edit permission");
    }

    [TestMethod]
    public async Task Native_modes_fixed_options_and_unknown_visibility_keep_the_shared_strict_rulesAsync()
    {
        Storage.Current!.Definition.InputParams = [
            new Input { Key = "fixed", Type = NativeType.Enum, VariableMode = Mode.Input, SelectionItems = [new("a"), new("b")] },
            new Input { Key = "suggested", Type = NativeType.Enum, VariableMode = Mode.UseVarOrInput, SelectionItems = [new("a")] },
            new Input { Key = "mode2", VariableMode = Mode.UseVar }, new Input { Key = "mode3", VariableMode = Mode.UseVarOnly },
            new Input { Key = "expression", VisibleExpression = "$=context" },
            new Input { Key = "structured", VisibleWhen = new object() },
        ];
        var contract = (await ReadAsync(Host())).Contract!;
        Assert.AreEqual("options", contract.Inputs[0].LiteralValueRestriction);
        Assert.AreEqual("none", contract.Inputs[1].LiteralValueRestriction);
        Assert.AreEqual("existing-literal-only", contract.Inputs[2].LiteralPolicy);
        Assert.AreEqual("existing-nonempty-literal-only", contract.Inputs[3].LiteralPolicy);
        foreach (var row in contract.Inputs.Skip(4)) { Assert.IsNotNull(row.BlockedReason); Assert.AreEqual("unknown", row.LiteralPolicy); }
        Storage.Current.Definition = new MultiRunner();
        var multi = (await ReadAsync(Host())).Contract!.Inputs.Single();
        Assert.IsFalse(multi.VisibilityResolved); Assert.AreEqual("NATIVE_OPERATION_MEMBERSHIP_REQUIRES_CONTEXT", multi.BlockedReason);
    }

    [TestMethod]
    public async Task Pre_cancelled_and_invalid_requests_do_not_probe_dispatch_or_read_native_definitionsAsync()
    {
        var probes = 0;
        var native = new V2StepRunnerInputContractNativePort(() => { probes++; throw new AssertFailedException(); }, () => throw new AssertFailedException(), (_, _) => throw new AssertFailedException());
        using var stop = new CancellationTokenSource(); await stop.CancelAsync();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ReadAsync(Host(native), token: stop.Token));
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => native.ReadDefinitionAsync("sys:fixture", stop.Token));
        Assert.AreEqual("INVALID_INPUT_CONTRACT_REQUEST", (await Host(native).GetStepRunnerInputContractAsync(new() { StepRunnerKey = " " })).ErrorCode);
        Assert.AreEqual(0, probes); Assert.AreEqual(0, Storage.Current!.Reads);
    }

    [TestMethod]
    public async Task Queued_cancellation_does_not_read_native_or_cancel_another_owner_and_running_cancellation_discards_successAsync()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = new List<Task<StepRunnerCatalog>>();
        Task<StepRunnerCatalog> DispatchAsync(Func<StepRunnerCatalog> work, CancellationToken _) {
            async Task<StepRunnerCatalog> RunAsync() { await release.Task; return work(); }
            var task = RunAsync(); pending.Add(task); return task;
        }
        var host = Host(Native(DispatchAsync)); using var stop = new CancellationTokenSource();
        var first = ReadAsync(host, token: stop.Token); var other = ReadAsync(host); await stop.CancelAsync();
        await Assert.ThrowsExceptionAsync<TaskCanceledException>(() => first.WaitAsync(TimeSpan.FromSeconds(2)));
        Assert.AreEqual(0, Storage.Current!.Reads); release.SetResult(); Assert.IsTrue((await other).Success);
        foreach (var task in pending) { try { await task; } catch (OperationCanceledException) { } }
        Assert.AreEqual(1, Storage.Current.Reads);
        using var running = new CancellationTokenSource();
        Storage.Current.OnRead = () => running.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => ReadAsync(Host(), token: running.Token));
        Assert.AreEqual(2, Storage.Current.Reads);
    }

    [TestMethod]
    public async Task Missing_native_facts_or_malformed_definition_cannot_fall_back_to_a_legacy_catalogAsync()
    {
        Storage.Current!.Definition.InputParams = [new MissingNativeFacts()];
        var unknown = (await ReadAsync(Host())).Contract!.Inputs.Single();
        Assert.IsFalse(unknown.PolicyKnown); Assert.IsNull(unknown.VarType); Assert.AreEqual("unknown", unknown.LiteralPolicy);
        Storage.Current.Definition.InputParams = [new Input { Key = "" }];
        Assert.AreEqual("INPUT_CONTRACT_READ_FAILED", (await ReadAsync(Host())).ErrorCode);
        Storage.Current.OnRead = () => throw new InvalidOperationException("native fixture fault");
        var error = await ReadAsync(Host()); Assert.AreEqual("INPUT_CONTRACT_READ_FAILED", error.ErrorCode); StringAssert.Contains(error.ErrorMessage, "native fixture fault");
    }

    [TestMethod]
    public async Task Actual_native_input_DTO_retains_false_zero_null_and_uses_only_the_current_runtime_definitionAsync()
    {
        var directory = Environment.GetEnvironmentVariable("QKRPC_V2_TEST_HOST_ROOT");
        if (string.IsNullOrEmpty(directory)) Assert.Inconclusive("Provide an explicit local compile-host directory for native DTO validation.");
        Assembly? ResolveNative(AssemblyLoadContext context, AssemblyName name) {
            if (name.Name is not ("Quicker.Public.Abstractions" or "Quicker.Common" or "Quicker.StepEngine.Core")) return null;
            var path = Path.Combine(directory!, name.Name + ".dll"); return File.Exists(path) ? context.LoadFromAssemblyPath(path) : null;
        }
        AssemblyLoadContext.Default.Resolving += ResolveNative;
        try {
            var engine = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory!, "Quicker.StepEngine.dll"));
            Assert.AreEqual(engine.GetType("Quicker.Domain.Actions.X.Storage.ActionStep", true),
                V2StepRunnerInputContractNativePort.FindLoadedType("Quicker.Domain.Actions.X.Storage.ActionStep", [engine]));
            Assert.IsNull(V2StepRunnerInputContractNativePort.FindLoadedType("Quicker.Domain.Actions.X.Storage.ActionStep", [typeof(Storage).Assembly]));
            Assert.IsNotNull(V2StepRunnerInputContractNativePort.Binding.TryCreate(
                engine.GetType("Quicker.Domain.Actions.X.Storage.ActionStep", true),
                engine.GetType("Quicker.Domain.Actions.X.StepRunners.IStepRunnerService", true),
                engine.GetType("Quicker.Domain.Actions.X.StepRunners.IStepRunner", true)), "The exact API shape must match the real compile host, not only a fake interface.");
            var core = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory!, "Quicker.StepEngine.Core.dll"));
            var type = core.GetType("Quicker.Domain.Actions.X.StepRunners.StepInParamDef", true)!;
            var parameter = Activator.CreateInstance(type)!;
            type.GetProperty("Key")!.SetValue(parameter, "text"); type.GetProperty("Name")!.SetValue(parameter, "Native text");
            Storage.Current!.Definition.InputParams = [parameter];
            var contract = (await ReadAsync(Host())).Contract!; var row = contract.Inputs.Single();
            Assert.AreEqual(0, row.VarType); Assert.AreEqual(0, row.VariableMode); Assert.IsFalse(row.AllowInput); Assert.IsFalse(row.IsControlField);
            Assert.AreEqual("allowed", row.LiteralPolicy); Assert.AreEqual("v2", contract.HostKind);
            var json = JObject.Parse(JsonSerializer.Serialize(contract, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault }));
            Assert.AreEqual(JTokenType.Null, json["controlFieldKey"]!.Type); Assert.AreEqual(JTokenType.Null, json["appliedControlFieldValue"]!.Type);
            var nativeRow = (JObject)json["inputs"]![0]!;
            Assert.AreEqual(0, nativeRow.Value<int>("varType")); Assert.AreEqual(0, nativeRow.Value<int>("variableMode"));
            Assert.AreEqual(JTokenType.Boolean, nativeRow["allowInput"]!.Type); Assert.IsFalse(nativeRow.Value<bool>("allowInput")); Assert.IsNotNull(nativeRow["blockedReason"]);
        } finally { AssemblyLoadContext.Default.Resolving -= ResolveNative; }
    }

    [TestMethod]
    public async Task DI_and_manual_bootstrap_expose_the_optional_port_without_starting_the_host_or_serverAsync()
    {
        var services = new ServiceCollection(); services.AddLogging(); services.AddQuickerRpcPluginV2Core();
        using var provider = services.BuildServiceProvider();
        var port = provider.GetRequiredService<IQuickerRpcHost>().StepRunners as IQuickerRpcStepRunnerInputContractHost;
        Assert.IsNotNull(port); Assert.IsFalse(port.IsInputContractAvailable);
        var rpc = provider.GetRequiredService<IQuickerRpcService>();
        Assert.IsFalse((await rpc.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
        var server = PluginV2BootstrapStack.CreateServerHost(NullLoggerFactory.Instance);
        var manual = (IQuickerRpcService)server.GetType().GetField("_service", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(server)!;
        Assert.IsFalse((await manual.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
        Assert.AreEqual("UNSUPPORTED_HOST", (await manual.GetStepRunnerInputContractAsync(new() { StepRunnerKey = "sys:fixture" })).ErrorCode);
        await server.StopAsync(default); Assert.IsNull(System.Windows.Application.Current);
    }

    [TestMethod]
    public async Task Runtime_handshake_advertises_the_injected_real_port_without_reading_a_definition_or_dispatchingAsync()
    {
        var native = Native((_, _) => throw new AssertFailedException("Health must not dispatch"));
        var services = new ServiceCollection(); services.AddLogging(); services.AddQuickerRpcPluginV2Core(); services.AddSingleton(Host(native));
        using var provider = services.BuildServiceProvider();
        var service = provider.GetRequiredService<IQuickerRpcService>();
        Assert.IsTrue((await service.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
        Assert.AreEqual(0, Storage.Current!.Reads);
        Storage.Current = null;
        Assert.IsFalse((await service.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.StepRunnerInputContractRead]);
    }

    public enum NativeType { Text = 0, Enum = 9 }
    public enum Mode { UseVarOrInput = 0, Input = 1, UseVar = 2, UseVarOnly = 3 }
    public enum Sources { Unspecified = 0, Literal = 2 }
    public enum Hint { Default = 0 }
    public sealed record Option(string Value);
    public class Input {
        public string Key { get; set; } = "text"; public string Name => Key; public NativeType Type { get; set; }
        public Mode VariableMode { get; set; } public bool AllowInput { get; set; } public bool IsControlField { get; set; }
        public Sources InputSources => Sources.Unspecified; public Hint EditorHint => Hint.Default;
        public object? DefaultValue { get; set; } public IList<Option>? SelectionItems { get; set; }
        public ICollection<string>? ValidForList { get; set; } public ICollection<string>? InvalidForList => null;
        public string? VisibleExpression { get; set; } public object? VisibleWhen { get; set; }
    }
    public sealed class MissingNativeFacts { public string Key => "unknown"; }
    public class Runner { public string Key => "sys:fixture"; public IList<object> InputParams { get; set; } = [new Input()]; }
    public class BaseMultiOperationStep : Runner { }
    public sealed class MultiRunner : BaseMultiOperationStep { }
    public interface INativeService { Runner? GetRunner(string key); }
    public sealed class NativeService : INativeService {
        public int Reads; public bool RequireDispatcher, InDispatcher; public Action? OnRead; public Runner Definition = new();
        public Runner? GetRunner(string key) { Reads++; if (RequireDispatcher) Assert.IsTrue(InDispatcher); OnRead?.Invoke(); return key == "sys:fixture" ? Definition : null; }
    }
    public static class Storage { public static NativeService? Current; public static int Probes; public static INativeService? StepRunnerService { get { Probes++; return Current; } } }
    public static class OldStorage { }
    private sealed class NoSummaries : IV2DesignerSummaryNativePort {
        public bool IsAvailable => false; public Task<string> ReadSummariesJsonAsync(string json, CancellationToken token) => throw new AssertFailedException();
    }
}
