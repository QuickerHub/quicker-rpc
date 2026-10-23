using System.Reflection;
using System.Reflection.Emit;
using System.Runtime.Loader;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin;
using QuickerRpc.Plugin.V2.Adapters;
using QuickerRpc.Plugin.V2.Composition;
using QuickerRpc.Plugin.V2.Reflection;
using QuickerRpc.Transport;

namespace QuickerRpc.Runtime.Test;

[TestClass, DoNotParallelize]
public sealed class V2DesignerReadCatalogTests
{
    private const string Page = "{\"items\":[{\"kind\":\"runner\",\"future\":{\"value\":\"kept\"}}],\"totalCount\":1,\"hasMore\":false,\"futurePage\":true}";
    private static V2DesignerReadNativePort.CatalogBinding Binding(Type? search = null) =>
        V2DesignerReadNativePort.CatalogBinding.TryCreate(typeof(CatalogFactory), typeof(CatalogDto), search ?? typeof(SearchLeaf))!;
    private static V2DesignerReadNativePort.FaBinding FaBinding() => V2DesignerReadNativePort.FaBinding.TryCreate(typeof(FaLeaf), typeof(FaDto))!;
    private static V2DesignerReadNativePort Native(Func<Func<Task<string>>, CancellationToken, Task<string>>? dispatch = null) =>
        new(() => Binding(), () => FaBinding(), () => true, dispatch ?? ((work, _) => work()));

    [TestInitialize]
    public void Reset()
    {
        CatalogFactory.Reads = 0; SearchLeaf.Constructors = 0; SearchLeaf.Replaces = 0; FaLeaf.Reads = 0;
        CatalogFactory.Read = () => new CatalogDto { Items = ["fixture"] };
        SearchLeaf.Read = (_, _, _, _) => Task.FromResult(Page);
        FaLeaf.Read = _ => new() { Icon = "Light_Test", Path = "M0 0", Width = 512, Height = 256, Fill = "#123456" };
    }

    [TestMethod]
    public async Task Host_preserves_native_page_and_explicit_subprogram_request_without_enrichment()
    {
        var port = new FakePort();
        port.Search = (json, quick, _) =>
        {
            var body = JObject.Parse(json);
            Assert.AreEqual("fixture", body.Value<string>("keyword")); Assert.AreEqual(0, body.Value<int>("skip"));
            if (quick) Assert.AreEqual("%%owned", body["subPrograms"]![0]!.Value<string>("identifier"));
            else Assert.IsNull(body["subPrograms"]);
            Assert.IsNull(body["scope"]); Assert.IsNull(body["recentStepIds"]);
            return Task.FromResult(Page);
        };
        var host = new V2DesignerReadHost(port);
        var quick = await host.SearchStepQuickInsertAsync("fixture", -1, [new() { Id = "owned", Name = "Name", Description = "Description", Identifier = "%%owned" }]);
        var toolbox = await host.SearchToolboxModulesAsync("fixture", 0);
        Assert.IsTrue(quick.Success, quick.ErrorMessage); Assert.AreEqual(Page, quick.Json);
        Assert.IsTrue(toolbox.Success, toolbox.ErrorMessage); Assert.AreEqual(Page, toolbox.Json);
        foreach (var malformed in new[] { "null", "{}", "{\"items\":[],\"totalCount\":1,\"hasMore\":1}", "{\"items\":[3],\"totalCount\":1,\"hasMore\":false}" })
        {
            port.Search = (_, _, _) => Task.FromResult(malformed);
            Assert.IsFalse((await host.SearchToolboxModulesAsync("", 0)).Success);
        }
    }

    [TestMethod]
    public async Task Geometry_maps_only_native_fields_and_rejects_lossy_dimensions_per_spec()
    {
        var port = new FakePort { Geometry = (spec, _) => Task.FromResult<V2DesignerNativeFaVector?>(spec switch
        {
            "missing" => null,
            "fraction" => new("Light_Fraction", "M", 1.5, 256, "red"),
            "nan" => new("Light_Nan", "M", double.NaN, 256, "red"),
            "overflow" => new("Light_Overflow", "M", (double)int.MaxValue + 1, 256, "red"),
            _ => new("Light_Test", "M0 0", 512, 256, "#123456"),
        }) };
        var host = new V2DesignerReadHost(port);
        var result = await host.ResolveFontAwesomeIconsAsync([" fa:Light_Test ", "FA:LIGHT_TEST", "", "missing", "fraction", "nan", "overflow"]);
        Assert.IsTrue(result.Success, result.ErrorMessage); Assert.AreEqual(1, result.Items.Count); Assert.AreEqual(4, result.Errors.Count);
        var item = result.Items[0];
        Assert.AreEqual("fa:Light_Test", item.Spec); Assert.AreEqual("Light_Test", item.EnumName); Assert.AreEqual("M0 0", item.Path);
        Assert.AreEqual(512, item.Width); Assert.AreEqual(256, item.Height); Assert.AreEqual("#123456", item.Color);
        Assert.IsNull(item.Label); Assert.AreEqual(0, item.Unicode);
        port.GeometryReads = 0;
        var capped = await host.ResolveFontAwesomeIconsAsync(Enumerable.Range(0, 81).Select(index => "fa:Light_" + index).ToArray());
        Assert.AreEqual(80, port.GeometryReads); Assert.AreEqual(80, capped.Items.Count); Assert.AreEqual(1, capped.Errors.Count);
    }

    [TestMethod]
    public async Task Unsupported_operations_never_call_a_native_port_and_preabort_wins()
    {
        var port = new FakePort { Refuse = true };
        var host = new V2DesignerReadHost(port);
        Assert.IsFalse((await host.OpenActionEditorAsync("fixture")).Ok);
        Assert.IsFalse((await host.OpenSubProgramEditorAsync("fixture")).Ok);
        Assert.IsFalse((await host.ReadClipboardFormatAsync("fixture")).Success);
        Assert.IsFalse((await host.WriteClipboardFormatAsync("fixture", "text")).Success);
        Assert.IsFalse((await host.GetDesignerContextAsync()).Ok);
        Assert.AreEqual("UNSUPPORTED_HOST", (await host.RunTextToolAsync("fixture")).ErrorCode);
        Assert.IsFalse((await host.SearchFontAwesomeIconsAsync("fixture")).Success);
        using var stop = new CancellationTokenSource(); stop.Cancel();
        foreach (var call in new Func<Task>[] {
            () => host.SearchStepQuickInsertAsync("", 0, [], stop.Token), () => host.SearchToolboxModulesAsync("", 0, stop.Token),
            () => host.ResolveFontAwesomeIconsAsync([], stop.Token), () => host.SearchFontAwesomeIconsAsync("", cancellationToken: stop.Token),
        }) await Assert.ThrowsExceptionAsync<OperationCanceledException>(call);
    }

    [TestMethod]
    public async Task Availability_only_inspects_exact_metadata_and_does_not_build_or_initialize_a_search()
    {
        var native = Native();
        Assert.IsTrue(native.IsQuickInsertAvailable); Assert.IsTrue(native.IsToolboxAvailable); Assert.IsTrue(native.IsFaGeometryAvailable);
        Assert.AreEqual(0, CatalogFactory.Reads); Assert.AreEqual(0, SearchLeaf.Constructors); Assert.AreEqual(0, FaLeaf.Reads);
        Assert.IsNull(V2DesignerReadNativePort.CatalogBinding.TryCreate(typeof(AsyncFactory), typeof(CatalogDto), typeof(SearchLeaf)));
        Assert.IsNull(V2DesignerReadNativePort.CatalogBinding.TryCreate(typeof(GenericFactory), typeof(CatalogDto), typeof(SearchLeaf)));
        Assert.IsNull(V2DesignerReadNativePort.CatalogBinding.TryCreate(typeof(CatalogFactory), typeof(FaDto), typeof(SearchLeaf)));
        Assert.IsNull(V2DesignerReadNativePort.FaBinding.TryCreate(typeof(BadFaLeaf), typeof(FaDto)));
        var partial = new V2DesignerReadNativePort(() => Binding(typeof(QuickOnlySearchLeaf)), () => null, () => true, (work, _) => work());
        Assert.IsTrue(partial.IsQuickInsertAvailable); Assert.IsFalse(partial.IsToolboxAvailable); Assert.IsFalse(partial.IsFaGeometryAvailable);
        var noDispatcher = new V2DesignerReadNativePort(() => throw new AssertFailedException("Missing dispatcher must short circuit native metadata."), () => throw new AssertFailedException(), () => false, (_, _) => throw new AssertFailedException());
        Assert.IsFalse(noDispatcher.IsQuickInsertAvailable); Assert.IsFalse(noDispatcher.IsToolboxAvailable); Assert.IsFalse(noDispatcher.IsFaGeometryAvailable);
        Assert.IsFalse((await new V2DesignerReadHost(noDispatcher).SearchToolboxModulesAsync("", 0)).Success);
        var broken = new V2DesignerReadNativePort(() => throw new MissingMethodException(), () => throw new MissingMethodException(), () => true, (_, _) => throw new AssertFailedException());
        Assert.IsFalse(broken.IsQuickInsertAvailable); Assert.IsFalse(broken.IsFaGeometryAvailable);
        var outside = new V2DesignerReadNativePort();
        Assert.IsFalse(outside.IsQuickInsertAvailable); Assert.IsFalse(outside.IsToolboxAvailable); Assert.IsFalse(outside.IsFaGeometryAvailable);
        Assert.IsNull(System.Windows.Application.Current);
        await Assert.ThrowsExceptionAsync<NotSupportedException>(() => V2DesignerReadNativePort.DispatchOnAsync(null,
            () => throw new AssertFailedException("No replacement dispatcher may be created."), default));
    }

    [TestMethod]
    public async Task Each_host_owns_one_catalog_snapshot_and_failed_or_canceled_builds_are_not_published()
    {
        var first = Native(); var other = Native();
        await first.SearchQuickInsertJsonAsync("{}", default); await first.SearchToolboxJsonAsync("{}", default);
        await other.SearchToolboxJsonAsync("{}", default);
        Assert.AreEqual(2, CatalogFactory.Reads); Assert.AreEqual(2, SearchLeaf.Constructors); Assert.AreEqual(2, SearchLeaf.Replaces);
        var retry = Native(); CatalogFactory.Read = () => new();
        await Assert.ThrowsExceptionAsync<InvalidDataException>(() => retry.SearchToolboxJsonAsync("{}", default));
        CatalogFactory.Read = () => new() { Items = ["after-empty"] };
        await retry.SearchToolboxJsonAsync("{}", default); Assert.AreEqual(4, CatalogFactory.Reads);
        using var stop = new CancellationTokenSource(); var canceled = Native();
        CatalogFactory.Read = () => { stop.Cancel(); return new() { Items = ["canceled"] }; };
        var before = SearchLeaf.Constructors;
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => canceled.SearchQuickInsertJsonAsync("{}", stop.Token));
        Assert.AreEqual(before, SearchLeaf.Constructors);
        CatalogFactory.Read = () => new() { Items = ["retry"] };
        await canceled.SearchQuickInsertJsonAsync("{}", default); Assert.AreEqual(before + 1, SearchLeaf.Constructors);
    }

    [TestMethod]
    public async Task Queued_and_inflight_cancel_drop_results_without_canceling_another_request_or_rebuilding_its_snapshot()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var dispatched = new List<Task<string>>();
        async Task<string> DispatchAsync(Func<Task<string>> work, CancellationToken token) { await release.Task; return await work(); }
        var native = Native((work, token) => { var pending = DispatchAsync(work, token); dispatched.Add(pending); return pending; });
        using var firstStop = new CancellationTokenSource();
        var first = native.SearchQuickInsertJsonAsync("{}", firstStop.Token);
        var other = native.SearchToolboxJsonAsync("{}", default);
        try
        {
            firstStop.Cancel();
            var error = await Assert.ThrowsExceptionAsync<TaskCanceledException>(() => first.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.AreEqual(firstStop.Token, error.CancellationToken); Assert.AreEqual(0, CatalogFactory.Reads);
            release.SetResult(); Assert.AreEqual(Page, await other.WaitAsync(TimeSpan.FromSeconds(2))); Assert.AreEqual(1, CatalogFactory.Reads);
        }
        finally
        {
            release.TrySetResult();
            foreach (var pending in dispatched) { try { await pending; } catch (OperationCanceledException) { } }
        }
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var nativeTasks = new List<Task<string>>();
        SearchLeaf.Read = (_, _, json, _) => json == "blocked" ? WaitAsync() : Task.FromResult(Page);
        async Task<string> WaitAsync() { started.SetResult(); return await finish.Task; }
        var running = Native((work, _) => { var pending = work(); nativeTasks.Add(pending); return pending; });
        using var stop = new CancellationTokenSource();
        var late = running.SearchQuickInsertJsonAsync("blocked", stop.Token);
        try
        {
            await started.Task.WaitAsync(TimeSpan.FromSeconds(2)); stop.Cancel();
            await Assert.ThrowsExceptionAsync<TaskCanceledException>(() => late.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.AreEqual(Page, await running.SearchToolboxJsonAsync("other-owner", default));
            finish.SetResult(Page);
        }
        finally
        {
            finish.TrySetResult(Page);
            foreach (var pending in nativeTasks) { try { await pending; } catch (OperationCanceledException) { } }
        }
    }

    [TestMethod]
    public async Task Host_cancellation_is_not_softened_by_missing_api_faults_or_late_geometry()
    {
        using var stop = new CancellationTokenSource();
        var native = new V2DesignerReadNativePort(() => { stop.Cancel(); return null; }, () => null, () => true, (_, _) => throw new AssertFailedException());
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => new V2DesignerReadHost(native).SearchToolboxModulesAsync("", 0, stop.Token));
        using var late = new CancellationTokenSource();
        var fake = new FakePort { Geometry = (_, _) => { late.Cancel(); return Task.FromResult<V2DesignerNativeFaVector?>(new("Light_Test", "M", 512, 512, "red")); } };
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => new V2DesignerReadHost(fake).ResolveFontAwesomeIconsAsync(["fa:Light_Test"], late.Token));
        using var fault = new CancellationTokenSource();
        fake.Search = (_, _, _) => { fault.Cancel(); throw new InvalidOperationException("late native failure"); };
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => new V2DesignerReadHost(fake).SearchToolboxModulesAsync("", 0, fault.Token));
    }

    [TestMethod]
    public async Task Compiled_native_catalog_DTO_and_pure_search_service_and_vector_DTO_use_the_real_leaf_shapes()
    {
        var root = Environment.GetEnvironmentVariable("QKRPC_V2_TEST_HOST_ROOT");
        if (string.IsNullOrWhiteSpace(root)) Assert.Inconclusive("Set QKRPC_V2_TEST_HOST_ROOT to an explicit compile host directory; only pure Designer assemblies are loaded.");
        foreach (var file in new[] { "Google.Protobuf.dll", "Quicker.Headless.Designer.Contracts.dll", "Quicker.Headless.Designer.Core.dll" })
            AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(root!, file));
        var contracts = AppDomain.CurrentDomain.GetAssemblies().Single(assembly => assembly.GetName().Name == "Quicker.Headless.Designer.Contracts");
        var core = AppDomain.CurrentDomain.GetAssemblies().Single(assembly => assembly.GetName().Name == "Quicker.Headless.Designer.Core");
        var dtoType = contracts.GetType("Quicker.Designer.Grpc.V1.GetStepRunnersResponse", true)!;
        var dto = Activator.CreateInstance(dtoType)!;
        var items = dtoType.GetProperty("Items")!.GetValue(dto)!;
        var runnerType = items.GetType().GenericTypeArguments.Single();
        var runner = Activator.CreateInstance(runnerType)!;
        runnerType.GetProperty("Key")!.SetValue(runner, "sys:fixture"); runnerType.GetProperty("Name")!.SetValue(runner, "Fixture");
        items.GetType().GetMethod("Add", [runnerType])!.Invoke(items, [runner]);
        var factory = TypedLeaf(dtoType, dto, "BuildStepRunnersResponse", false);
        var search = core.GetType("Quicker.Designer.Search.DesignerStepRunnerSearchService", true)!;
        var binding = V2DesignerReadNativePort.CatalogBinding.TryCreate(factory, dtoType, search);
        Assert.IsNotNull(binding, "The compiled native DTO must match the real pure-search leaf signatures.");
        var faType = contracts.GetType("Quicker.Designer.Contracts.Rpc.DesignerFaIconVectorRpcDto", true)!;
        var vector = Activator.CreateInstance(faType)!;
        foreach (var pair in new Dictionary<string, object> { ["Icon"] = "Light_Test", ["Path"] = "M0 0", ["Width"] = 512d, ["Height"] = 256d, ["Fill"] = "#123456" })
            faType.GetProperty(pair.Key)!.SetValue(vector, pair.Value);
        var fa = V2DesignerReadNativePort.FaBinding.TryCreate(TypedLeaf(faType, vector, "TryResolveVector", true), faType);
        Assert.IsNotNull(fa);
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
        var dispatcher = await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        try
        {
            Task<string> DispatchAsync(Func<Task<string>> work, CancellationToken token) => V2DesignerReadNativePort.DispatchOnAsync(dispatcher, async () =>
            {
                Assert.IsTrue(dispatcher.CheckAccess());
                await Task.Yield();
                Assert.IsTrue(dispatcher.CheckAccess(), "The asynchronous native read must retain its owned dispatcher.");
                return await work();
            }, token);
            var host = new V2DesignerReadHost(new V2DesignerReadNativePort(() => binding, () => fa, () => true, DispatchAsync));
            var page = await host.SearchStepQuickInsertAsync("", 0, []);
            Assert.IsTrue(page.Success, page.ErrorMessage); StringAssert.Contains(page.Json, "sys:fixture");
            Assert.IsTrue((await host.SearchToolboxModulesAsync("", 0)).Success);
            var resolved = await host.ResolveFontAwesomeIconsAsync(["fa:Light_Test"]);
            Assert.IsTrue(resolved.Success, resolved.ErrorMessage); Assert.AreEqual("#123456", resolved.Items.Single().Color);
            Assert.AreNotEqual(typeof(V2DesignerReadCatalogTests).Assembly, typeof(V2DesignerReadHost).Assembly);
        }
        finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal); Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5))); }
    }

    [TestMethod]
    public async Task Both_existing_compositions_supply_the_default_read_adapter_without_a_host_or_editor_capability()
    {
        var services = new ServiceCollection(); services.AddLogging(); services.AddQuickerRpcPluginV2Core();
        var provider = services.BuildServiceProvider();
        // Resolve on an owned background task so a recursive DI factory fails this fixture within a bounded time.
        var resolving = Task.Run(() => (Host: provider.GetRequiredService<IQuickerRpcHost>(), Rpc: provider.GetRequiredService<IQuickerRpcService>()));
        try
        {
            var resolved = await resolving.WaitAsync(TimeSpan.FromSeconds(3));
            var host = resolved.Host;
            Assert.IsNotNull(host.Designer); Assert.IsFalse(host.Capabilities.DesignerUi);
            var reads = (IQuickerRpcDesignerReadAvailability)host.Designer;
            Assert.IsFalse(reads.IsStepQuickInsertAvailable); Assert.IsFalse(reads.IsToolboxModulesAvailable); Assert.IsFalse(reads.IsFontAwesomeGeometryAvailable);
            var diSession = await resolved.Rpc.GetHostSessionAsync();
            var manual = PluginV2BootstrapStack.CreateServerHost(NullLoggerFactory.Instance);
            try
            {
                var manualRpc = (IQuickerRpcService)typeof(QuickerRpcServerHost).GetField("_service", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(manual)!;
                var manualSession = await manualRpc.GetHostSessionAsync();
                foreach (var session in new[] { diSession, manualSession })
                    foreach (var key in new[] { QuickerRpcHostCapabilityNames.DesignerQuickInsertRead, QuickerRpcHostCapabilityNames.DesignerToolboxRead, QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve, QuickerRpcHostCapabilityNames.DesignerActionOpen, QuickerRpcHostCapabilityNames.DesignerSubProgramOpen, QuickerRpcHostCapabilityNames.DesignerContextRead })
                        Assert.IsFalse(session.Capabilities[key]);
                Assert.IsFalse((await manualRpc.SearchFontAwesomeIconsAsync("fixture")).Success);
                Assert.IsFalse((await manualRpc.EditActionAsync("fixture")).Ok);
                Assert.IsFalse((await manualRpc.ReadClipboardSpecialFormatAsync("fixture")).Success);
            }
            finally
            {
                await manual.StopAsync(default);
                ((CancellationTokenSource)typeof(QuickerRpcServerHost).GetField("_shutdown", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(manual)!).Dispose();
            }
        }
        catch (TimeoutException) { Assert.Fail("V2 core DI did not resolve within 3 seconds. Check for an IQuickerRpcHost factory resolving itself."); }
        finally
        {
            if (resolving.IsCompleted) provider.Dispose();
            else _ = resolving.ContinueWith(task =>
            {
                _ = task.Exception;
                try { provider.Dispose(); } catch (Exception error) { System.Diagnostics.Trace.TraceError("Late fixture cleanup failed: " + error); }
            }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        }
        Assert.IsNull(System.Windows.Application.Current);
    }

    private static Type TypedLeaf(Type dto, object value, string methodName, bool takesSpec)
    {
        var assembly = AssemblyBuilder.DefineDynamicAssembly(new("QkrpcOwnedReadFixture" + Guid.NewGuid().ToString("N")), AssemblyBuilderAccess.RunAndCollect);
        var type = assembly.DefineDynamicModule("Fixture").DefineType("OwnedLeaf", TypeAttributes.Public | TypeAttributes.Abstract | TypeAttributes.Sealed);
        var field = type.DefineField("Value", typeof(object), FieldAttributes.Public | FieldAttributes.Static);
        var method = type.DefineMethod(methodName, MethodAttributes.Public | MethodAttributes.Static, dto, takesSpec ? [typeof(string)] : Type.EmptyTypes);
        var il = method.GetILGenerator(); il.Emit(OpCodes.Ldsfld, field); il.Emit(OpCodes.Castclass, dto); il.Emit(OpCodes.Ret);
        var created = type.CreateType()!; created.GetField("Value")!.SetValue(null, value); return created;
    }

    public sealed class CatalogDto { public List<string> Items { get; set; } = []; }
    public static class CatalogFactory
    {
        public static int Reads;
        public static Func<CatalogDto> Read = () => new();
        public static CatalogDto BuildStepRunnersResponse() { Reads++; return Read(); }
    }
    public static class AsyncFactory { public static Task<CatalogDto> BuildStepRunnersResponse() => throw new AssertFailedException(); }
    public static class GenericFactory { public static CatalogDto BuildStepRunnersResponse<T>() => throw new AssertFailedException(); }
    public class SearchLeaf
    {
        public static int Constructors, Replaces;
        public static Func<SearchLeaf, bool, string, CancellationToken, Task<string>> Read = (_, _, _, _) => Task.FromResult(Page);
        public SearchLeaf() => Constructors++;
        public void ReplaceCatalog(CatalogDto catalog) => Replaces++;
        public Task<string> PostStepQuickInsertSearchJsonAsync(string json, CancellationToken token) => Read(this, true, json, token);
        public Task<string> PostToolboxSearchJsonAsync(string json, CancellationToken token) => Read(this, false, json, token);
    }
    public class QuickOnlySearchLeaf
    {
        public void ReplaceCatalog(CatalogDto catalog) { }
        public Task<string> PostStepQuickInsertSearchJsonAsync(string json, CancellationToken token) => Task.FromResult(Page);
    }
    public sealed class FaDto { public string Icon { get; set; } = ""; public string Path { get; set; } = ""; public double Width { get; set; } public double Height { get; set; } public string Fill { get; set; } = ""; }
    public static class FaLeaf
    {
        public static int Reads;
        public static Func<string, FaDto?> Read = _ => null;
        public static FaDto? TryResolveVector(string spec) { Reads++; return Read(spec); }
    }
    public static class BadFaLeaf { public static Task<FaDto> TryResolveVector(string spec) => throw new AssertFailedException(); }
    private sealed class FakePort : IV2DesignerReadNativePort
    {
        public bool Refuse; public int GeometryReads;
        public Func<string, bool, CancellationToken, Task<string>> Search = (_, _, _) => Task.FromResult(Page);
        public Func<string, CancellationToken, Task<V2DesignerNativeFaVector?>> Geometry = (_, _) => Task.FromResult<V2DesignerNativeFaVector?>(null);
        private bool Available => !Refuse ? true : throw new AssertFailedException("Unexpected native port access.");
        public bool IsQuickInsertAvailable => Available; public bool IsToolboxAvailable => Available; public bool IsFaGeometryAvailable => Available;
        public Task<string> SearchQuickInsertJsonAsync(string json, CancellationToken token) { _ = Available; return Search(json, true, token); }
        public Task<string> SearchToolboxJsonAsync(string json, CancellationToken token) { _ = Available; return Search(json, false, token); }
        public Task<V2DesignerNativeFaVector?> ResolveFaGeometryAsync(string spec, CancellationToken token) { _ = Available; GeometryReads++; return Geometry(spec, token); }
    }
}
