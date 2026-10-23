using System.Reflection;
using System.Runtime.Loader;
using System.Windows.Threading;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Plugin.V2.Services;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class V2DesignerReadPrimitivesTests
{
    private static IList<QuickerRpcActionStepSummaryInput> Steps => [new() { StepId = "fixture", StepRunnerKey = "sys:fixture", StepJson = "{\"note\":\"fixture\"}" }];
    private static V2StepRunnerHost Host(IV2DesignerSummaryNativePort? port = null) => new(new V2HeadlessActionProgramService(), port ?? new FakePort());

    [TestMethod]
    public async Task Ui_detail_uses_the_real_full_serializer_while_agent_detail_keeps_its_compressed_shape()
    {
        var catalog = new StepRunnerCatalog { Items = [new()
        {
            Key = "sys:fixture", Name = "Fixture", Icon = "fa:Light_Test", InputParamDefs = [new()
            {
                Key = "mode", Name = "Mode", VarType = 9, IsControlField = true, AllowInput = true,
                SelectionItems = [new() { Value = "copy", Name = "Copy", Description = "Copy description" }, new() { Value = "move", Name = "Move" }],
            }, new() { Key = "text", Name = "Text", VarType = 0, VariableMode = 1, IsMultiLine = true, IsAdvanced = true, TextTools = "Trim", ValidForValues = ["copy"] }],
        }] };
        var service = new V2HeadlessActionProgramService(() => catalog, () => true);
        var host = new V2StepRunnerHost(service, new FakePort());
        var ui = await host.GetUiDetailAsync("sys:fixture", "copy");
        var agent = await host.GetDetailAsync("sys:fixture", "copy");
        var expected = StepRunnerCatalogMapper.GetDetail(catalog, "sys:fixture", "copy").Schema!;
        Assert.AreEqual(StepRunnerUiSchemaJson.Serialize(expected), ui.SchemaJson);
        Assert.AreEqual(StepRunnerAgentSchemaJson.Serialize(expected), agent.SchemaJson);
        Assert.AreNotEqual(agent.SchemaJson, ui.SchemaJson);
        var full = JObject.Parse(ui.SchemaJson!);
        Assert.AreEqual("fa:Light_Test", full.Value<string>("icon"));
        Assert.IsNotNull(full["controlField"]);
        Assert.IsNotNull(full["inputs"]!.First(row => row.Value<string>("key") == "text")["variableMode"]);
        Assert.IsNull(JObject.Parse(agent.SchemaJson!)["icon"]);
        Assert.IsNull(JObject.Parse(agent.SchemaJson!)["controlField"]);
    }

    [TestMethod]
    public async Task Summary_request_and_response_use_the_native_leaf_contract_without_other_host_calls()
    {
        var port = new FakePort { Read = (json, _) =>
        {
            var body = JObject.Parse(json);
            Assert.AreEqual("fixture", body["steps"]![0]!.Value<string>("stepId"));
            Assert.AreEqual("sys:fixture", body["steps"]![0]!.Value<string>("stepRunnerKey"));
            Assert.AreEqual(Steps[0].StepJson, body["steps"]![0]!.Value<string>("stepJson"));
            Assert.AreEqual("[{\"id\":\"child\"}]", body.Value<string>("subProgramsJson"));
            return Task.FromResult("{\"items\":[{\"stepId\":\"fixture\",\"summary\":\"native summary\"}]}");
        } };
        var result = await Host(port).SummarizeStepsAsync(Steps, "[{\"id\":\"child\"}]");
        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual("native summary", result.Items.Single().Summary);
        Assert.AreEqual(1, port.Reads);
        Assert.IsFalse(new V2QuickerRpcHostCapabilities().DesignerUi);
    }

    [TestMethod]
    public async Task Missing_api_and_invalid_native_results_are_explicit_failures_and_empty_requests_do_not_probe()
    {
        var port = new FakePort { Available = false };
        Assert.IsTrue((await Host(port).SummarizeStepsAsync([])).Success);
        Assert.AreEqual(0, port.Probes);
        Assert.IsFalse((await Host(port).SummarizeStepsAsync(Steps)).Success);
        Assert.AreEqual(0, port.Reads);
        foreach (var json in new[] { "null", "{}", "{\"items\":{}}", "{\"items\":[{\"stepId\":3,\"summary\":\"x\"}]}" })
        {
            var invalid = new FakePort { Read = (_, _) => Task.FromResult(json) };
            Assert.IsFalse((await Host(invalid).SummarizeStepsAsync(Steps)).Success);
        }
        var fault = new FakePort { Read = (_, _) => throw new InvalidOperationException("native unavailable") };
        StringAssert.Contains((await Host(fault).SummarizeStepsAsync(Steps)).ErrorMessage, "native unavailable");
        Assert.IsNull(V2DesignerSummaryNativePort.FindCompute(typeof(MissingLeaf)));
        Assert.IsNull(V2DesignerSummaryNativePort.FindCompute(typeof(AsyncLeaf)));
        Assert.IsNull(V2DesignerSummaryNativePort.FindCompute(typeof(GenericLeaf)));
        Assert.IsNotNull(V2DesignerSummaryNativePort.FindCompute(typeof(ExactLeaf)));
        Assert.IsFalse(new V2DesignerSummaryNativePort().IsAvailable, "The test process must not manufacture an Application dispatcher or initialize a real host.");
        Assert.IsNull(System.Windows.Application.Current);
        await Assert.ThrowsExceptionAsync<NotSupportedException>(() => V2DesignerSummaryNativePort.DispatchOnApplicationAsync(
            () => throw new AssertFailedException("No dispatcher may be manufactured."), default));
    }

    [TestMethod]
    public async Task Canceled_reads_never_probe_or_dispatch_and_late_native_success_is_rejected()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var port = new FakePort();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => Host(port).SummarizeStepsAsync(Steps, cancellationToken: cancellation.Token));
        Assert.AreEqual(0, port.Probes); Assert.AreEqual(0, port.Reads);
        var dispatches = 0;
        var native = new V2DesignerSummaryNativePort(_ => throw new AssertFailedException(), () => throw new AssertFailedException(), (work, token) => { dispatches++; return Task.FromResult(work()); });
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => native.ReadSummariesJsonAsync("{}", cancellation.Token));
        Assert.AreEqual(0, dispatches);
        using var late = new CancellationTokenSource();
        var latePort = new FakePort { Read = (_, _) => { late.Cancel(); return Task.FromResult("{\"items\":[]}"); } };
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => Host(latePort).SummarizeStepsAsync(Steps, cancellationToken: late.Token));
        using var availability = new CancellationTokenSource();
        var unavailable = new V2DesignerSummaryNativePort(_ => throw new AssertFailedException(), () => { availability.Cancel(); return false; },
            (_, _) => throw new AssertFailedException("Canceled availability must not dispatch."));
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => Host(unavailable).SummarizeStepsAsync(Steps, cancellationToken: availability.Token));
        using var readFailure = new CancellationTokenSource();
        var failed = new FakePort { Read = (_, _) => { readFailure.Cancel(); throw new InvalidOperationException("native failed after cancellation"); } };
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => Host(failed).SummarizeStepsAsync(Steps, cancellationToken: readFailure.Token));
        using var catalogRead = new CancellationTokenSource();
        var catalog = new V2HeadlessActionProgramService(() => { catalogRead.Cancel(); return new StepRunnerCatalog(); }, () => true);
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => new V2StepRunnerHost(catalog).GetUiDetailAsync("fixture", cancellationToken: catalogRead.Token));
    }

    [TestMethod]
    public async Task Queued_and_running_cancel_keep_other_request_owners_independent()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var computed = 0;
        var dispatched = new List<Task<string>>();
        Task<string> DispatchAsync(Func<string> work, CancellationToken token)
        {
            async Task<string> RunAsync() { await release.Task; return work(); }
            var pending = RunAsync();
            dispatched.Add(pending);
            return pending;
        }
        var native = new V2DesignerSummaryNativePort(_ => { Interlocked.Increment(ref computed); return new { items = Array.Empty<object>() }; }, () => true,
            DispatchAsync);
        using var firstOwner = new CancellationTokenSource();
        var first = native.ReadSummariesJsonAsync("{}", firstOwner.Token);
        var other = native.ReadSummariesJsonAsync("{}", default);
        try
        {
            firstOwner.Cancel();
            var canceled = await Assert.ThrowsExceptionAsync<TaskCanceledException>(() => first.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.AreEqual(firstOwner.Token, canceled.CancellationToken);
            Assert.AreEqual(0, computed);
            release.SetResult();
            Assert.AreEqual("{\"items\":[]}", await other.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.AreEqual(1, computed);
        }
        finally
        {
            release.TrySetResult();
            foreach (var pending in dispatched)
            {
                try { await pending; }
                catch (OperationCanceledException) { }
            }
        }
        using var running = new CancellationTokenSource();
        var runningNative = new V2DesignerSummaryNativePort(_ => { running.Cancel(); return new { items = Array.Empty<object>() }; }, () => true, (work, _) => Task.FromResult(work()));
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => runningNative.ReadSummariesJsonAsync("{}", running.Token));
    }

    [TestMethod]
    public async Task Owned_async_dispatcher_and_actual_native_response_DTO_pass_the_compiled_plugin_boundary()
    {
        var root = Environment.GetEnvironmentVariable("QKRPC_V2_TEST_HOST_ROOT");
        if (string.IsNullOrWhiteSpace(root)) Assert.Inconclusive("Set QKRPC_V2_TEST_HOST_ROOT to an explicit compile host directory; no host data is read.");
        Assert.AreNotEqual(typeof(V2DesignerReadPrimitivesTests).Assembly, typeof(V2HeadlessActionProgramService).Assembly);
        var contracts = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(root!, "Quicker.Headless.Designer.Contracts.dll"));
        var response = Activator.CreateInstance(contracts.GetType("Quicker.Designer.Contracts.Rpc.StepRunnersSummariesResponseDto", true)!)!;
        var item = Activator.CreateInstance(contracts.GetType("Quicker.Designer.Contracts.Rpc.StepRunnerSummaryItemDto", true)!)!;
        item.GetType().GetProperty("StepId")!.SetValue(item, "fixture"); item.GetType().GetProperty("Summary")!.SetValue(item, "real native DTO");
        ((System.Collections.IList)response.GetType().GetProperty("Items")!.GetValue(response)!).Add(item);
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); });
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
        var dispatcher = await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        try
        {
            var native = new V2DesignerSummaryNativePort(_ => { Assert.AreEqual(thread.ManagedThreadId, Environment.CurrentManagedThreadId); return response; }, () => true,
                (work, token) => dispatcher.InvokeAsync(work, DispatcherPriority.Normal, token).Task);
            var result = await Host(native).SummarizeStepsAsync(Steps);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.AreEqual("real native DTO", result.Items.Single().Summary);
        }
        finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal); Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5))); }
    }

    public static class MissingLeaf { public static object Compute(int value) => throw new AssertFailedException(); }
    public static class AsyncLeaf { public static Task<object> Compute(string value) => throw new AssertFailedException(); }
    public static class GenericLeaf { public static object Compute<T>(string value) => throw new AssertFailedException(); }
    public static class ExactLeaf { public static object Compute(string value) => new { items = Array.Empty<object>() }; }
    private sealed class FakePort : IV2DesignerSummaryNativePort
    {
        public bool Available = true;
        public int Probes, Reads;
        public Func<string, CancellationToken, Task<string>> Read = (_, _) => Task.FromResult("{\"items\":[]}");
        public bool IsAvailable { get { Probes++; return Available; } }
        public Task<string> ReadSummariesJsonAsync(string json, CancellationToken token) { Reads++; return Read(json, token); }
    }
}
