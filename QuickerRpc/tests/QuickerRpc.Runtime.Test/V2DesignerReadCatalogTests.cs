using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Collections.Immutable;
using System.Runtime.Loader;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.AgentModel.Catalog;
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
    public TestContext TestContext { get; set; } = null!;
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
        FaPageLeaf.Reads = 0;
        FaPageLeaf.Read = (_, _, _, _) => new(["Light_Camera"], 1, 0, 96, false, "", null);
    }

    private static V2DesignerReadNativePort PageNative(Func<Func<Task<string>>, CancellationToken, Task<string>>? dispatch = null,
        Func<V2DesignerReadNativePort.FaPageBinding?>? binding = null, bool dispatcher = true) =>
        new(() => null, () => null, () => dispatcher, dispatch ?? ((work, _) => work()), binding ?? (() => V2DesignerReadNativePort.FaPageBinding.TryCreate(typeof(FaPageLeaf), typeof(FaPageDto))));

    [TestMethod]
    public void Read_metadata_lookup_only_inspects_the_exact_already_loaded_assembly_owners()
    {
        var outsider = new MetadataAssembly("Quicker.Unrelated", () => throw new AssertFailedException("Unrelated assemblies cannot be inspected."));
        foreach (var (name, owner) in new[] {
            ("Quicker.Modules.Headless.HostAdapter.QuickerDesignerPluginDataService", "Quicker"),
            ("Quicker.Designer.Grpc.V1.GetStepRunnersResponse", "Quicker.Headless.Designer.Contracts"),
            ("Quicker.Designer.Search.DesignerStepRunnerSearchService", "Quicker.Headless.Designer.Core"),
            ("Quicker.Designer.Plugin.QuickerPluginFontAwesomePathResolver", "Quicker"),
            ("Quicker.Designer.Contracts.Rpc.DesignerFaIconVectorRpcDto", "Quicker.Headless.Designer.Contracts"),
            ("Quicker.Designer.Plugin.FaIconSearchPage", "Quicker.Headless.Core"),
            ("Quicker.Designer.Plugin.FaIconSearchPage", "Quicker"),
        })
        {
            var match = new MetadataAssembly(owner, () => typeof(FaPageDto));
            Assert.AreEqual(typeof(FaPageDto), V2DesignerReadNativePort.FindLoadedNativeType(name, [outsider, match]));
            Assert.AreEqual(1, match.Reads);
        }
        Assert.AreEqual(0, outsider.Reads);
        var missing = new MetadataAssembly("Quicker.Headless.Core", () => null);
        Assert.IsNull(V2DesignerReadNativePort.FindLoadedNativeType("Quicker.Designer.Plugin.FaIconSearchPage", [missing]));
        Assert.AreEqual(1, missing.Reads);
        var broken = new MetadataAssembly("Quicker.Headless.Core", () => throw new FileNotFoundException("fixture missing metadata"));
        Assert.IsNull(V2DesignerReadNativePort.FindLoadedNativeType("Quicker.Designer.Plugin.FaIconSearchPage", [broken]));
        Assert.IsNull(V2DesignerReadNativePort.FindLoadedNativeType("Quicker.UnreviewedType", [outsider]));
    }

    [TestMethod]
    public async Task FontAwesome_page_fixed_native_DTO_windows_match_the_source_golden_and_portable_matcher()
    {
        var catalog = new[] { "Brands_Camera", "Light_Camera", "Regular_Camera", "Solid_Dog" };
        var fixtures = new[]
        {
            (Query: "", Style: "", Skip: -1, Take: 2, Page: new FaPageDto(["Light_Camera", "Regular_Camera"], 4, 0, 2, true, "", null)),
            (Query: "camera", Style: "", Skip: 2, Take: 2, Page: new FaPageDto(["Brands_Camera"], 3, 2, 2, false, "camera", null)),
            (Query: " 相机 ", Style: "Regular", Skip: 0, Take: 96, Page: new FaPageDto(["Regular_Camera"], 1, 0, 96, false, "相机", "Regular")),
            (Query: " camera ", Style: " Brand ", Skip: 0, Take: 0, Page: new FaPageDto(["Brands_Camera"], 1, 0, 96, false, "camera", "Brands")),
            (Query: "", Style: "", Skip: int.MaxValue, Take: int.MaxValue, Page: new FaPageDto([], 4, int.MaxValue, 300, false, "", null)),
            (Query: "unmatched-xyz", Style: "future-style", Skip: 0, Take: 3, Page: new FaPageDto([], 0, 0, 3, false, "unmatched-xyz", "future-style")),
        };
        var native = PageNative(); var host = new V2DesignerReadHost(native);
        Assert.IsTrue(host.IsFontAwesomePageAvailable); Assert.AreEqual(0, FaPageLeaf.Reads);
        foreach (var fixture in fixtures)
        {
            FaPageLeaf.Read = (query, style, skip, take) =>
            {
                Assert.AreEqual(fixture.Query, query); Assert.AreEqual(fixture.Style, style); Assert.AreEqual(fixture.Skip, skip); Assert.AreEqual(fixture.Take, take);
                return fixture.Page;
            };
            var page = await host.SearchFontAwesomeIconsPageAsync(fixture.Query, fixture.Style, fixture.Skip, fixture.Take);
            Assert.IsTrue(page.Success, page.ErrorMessage);
            var portable = FontAwesomeIconPageSearch.Search(catalog, fixture.Query, fixture.Style, fixture.Skip, fixture.Take);
            CollectionAssert.AreEqual(fixture.Page.Names.ToArray(), portable.Names.ToArray());
            CollectionAssert.AreEqual(portable.Names.ToArray(), page.Names.ToArray());
            Assert.AreEqual(portable.TotalCount, page.TotalCount); Assert.AreEqual(portable.Skip, page.Skip); Assert.AreEqual(portable.Take, page.Take);
            Assert.AreEqual(portable.HasMore, page.HasMore); Assert.AreEqual(portable.Query, page.Query); Assert.AreEqual(portable.Style, page.Style);
        }
        Assert.AreEqual(fixtures.Length, FaPageLeaf.Reads);
        Assert.IsFalse((await host.SearchFontAwesomeIconsAsync("camera")).Success, "Legacy compressed search is still unsupported on V2.");
    }

    [TestMethod]
    public async Task FontAwesome_page_metadata_missing_dispatcher_and_inconsistent_native_pages_fail_closed()
    {
        Assert.IsNull(V2DesignerReadNativePort.FaPageBinding.TryCreate(typeof(AsyncFaPageLeaf), typeof(FaPageDto)));
        Assert.IsNull(V2DesignerReadNativePort.FaPageBinding.TryCreate(typeof(GenericFaPageLeaf), typeof(FaPageDto)));
        Assert.IsNull(V2DesignerReadNativePort.FaPageBinding.TryCreate(typeof(FaPageLeaf), typeof(FaDto)));
        Assert.IsNull(V2DesignerReadNativePort.FaPageBinding.TryCreate(typeof(BadFaPageLeaf), typeof(BadFaPageDto)));
        Assert.IsFalse(PageNative(dispatcher: false).IsFaPageAvailable);
        Assert.IsFalse(new V2DesignerReadNativePort().IsFaPageAvailable);
        Assert.IsFalse((await new V2DesignerReadHost(PageNative(binding: () => null)).SearchFontAwesomeIconsPageAsync("", null)).Success);
        Assert.AreEqual(0, FaPageLeaf.Reads);
        var host = new V2DesignerReadHost(PageNative());
        foreach (var invalid in new[] {
            new FaPageDto(["Light_Camera"], 1, 0, 96, true, "", null),
            new FaPageDto(["Light_Camera"], 3, 0, 96, false, "", null),
            new FaPageDto(["Light_Camera"], 1, 1, 96, false, "", null),
            new FaPageDto([""], 1, 0, 96, false, "", null),
            new FaPageDto([], -1, 0, 96, false, "", null),
            new FaPageDto([], 0, 0, 96, false, "changed-query", null),
            new FaPageDto([], 0, 0, 96, false, "", "Solid"),
            new FaPageDto(null!, 0, 0, 96, false, "", null),
            new FaPageDto([], 0, 0, 96, false, null!, null),
        })
        {
            FaPageLeaf.Read = (_, _, _, _) => invalid;
            var result = await host.SearchFontAwesomeIconsPageAsync("", null);
            Assert.IsFalse(result.Success); StringAssert.Contains(result.ErrorMessage, "UNSUPPORTED_HOST"); Assert.AreEqual(0, result.Names.Count);
        }
    }

    [TestMethod]
    public async Task FontAwesome_page_queue_preabort_and_late_native_cancel_do_not_cancel_another_owner()
    {
        using var before = new CancellationTokenSource(); before.Cancel();
        var untouched = PageNative(binding: () => throw new AssertFailedException("Preabort must not inspect metadata."));
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => untouched.SearchFaPageAsync("", "", 0, 96, before.Token));
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var dispatched = new List<Task<string>>();
        async Task<string> DispatchAsync(Func<Task<string>> work, CancellationToken token) { await release.Task; return await work(); }
        var native = PageNative((work, token) => { var pending = DispatchAsync(work, token); dispatched.Add(pending); return pending; });
        using var queuedStop = new CancellationTokenSource();
        var queued = native.SearchFaPageAsync("", "", 0, 96, queuedStop.Token);
        var other = native.SearchFaPageAsync("", "", 0, 96, default);
        try
        {
            queuedStop.Cancel();
            var error = await Assert.ThrowsExceptionAsync<TaskCanceledException>(() => queued.WaitAsync(TimeSpan.FromSeconds(2)));
            Assert.AreEqual(queuedStop.Token, error.CancellationToken); Assert.AreEqual(0, FaPageLeaf.Reads);
            release.SetResult(); Assert.AreEqual("Light_Camera", (await other.WaitAsync(TimeSpan.FromSeconds(2))).Names.Single());
            Assert.AreEqual(1, FaPageLeaf.Reads);
        }
        finally
        {
            release.TrySetResult();
            foreach (var pending in dispatched) { try { await pending; } catch (OperationCanceledException) { } }
        }
        using var late = new CancellationTokenSource();
        FaPageLeaf.Read = (_, _, _, _) => { late.Cancel(); return new(["Light_Camera"], 1, 0, 96, false, "", null); };
        var lateError = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => new V2DesignerReadHost(PageNative()).SearchFontAwesomeIconsPageAsync("", null, cancellationToken: late.Token));
        Assert.AreEqual(late.Token, lateError.CancellationToken);
        FaPageLeaf.Read = (_, _, _, _) => new(["Light_Camera"], 1, 0, 96, false, "", null);
        Assert.IsTrue((await new V2DesignerReadHost(PageNative()).SearchFontAwesomeIconsPageAsync("", null)).Success);
    }

    [TestMethod]
    public async Task FontAwesome_page_runs_on_an_owned_async_dispatcher_without_creating_Application()
    {
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA); thread.Start();
        var dispatcher = await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        try
        {
            FaPageLeaf.Read = (_, _, _, _) => { Assert.IsTrue(dispatcher.CheckAccess()); return new(["Light_Camera"], 1, 0, 96, false, "", null); };
            Task<string> DispatchAsync(Func<Task<string>> work, CancellationToken token) => V2DesignerReadNativePort.DispatchOnAsync(dispatcher, async () =>
            { await Task.Yield(); Assert.IsTrue(dispatcher.CheckAccess()); return await work(); }, token);
            var result = await new V2DesignerReadHost(PageNative(DispatchAsync)).SearchFontAwesomeIconsPageAsync("", null);
            Assert.IsTrue(result.Success, result.ErrorMessage); Assert.AreEqual("Light_Camera", result.Names.Single());
            Assert.IsNull(System.Windows.Application.Current);
        }
        finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal); Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5))); }
    }

    [TestMethod]
    public async Task Compiled_native_FontAwesome_page_metadata_matches_the_exact_port_or_remains_explicitly_unsupported()
    {
        var root = Environment.GetEnvironmentVariable("QKRPC_V2_TEST_HOST_ROOT");
        if (string.IsNullOrWhiteSpace(root)) Assert.Inconclusive("Set QKRPC_V2_TEST_HOST_ROOT to an explicit compile host directory for metadata-only inspection.");
        // Quicker.dll has AppLoggingBootstrap's module initializer. Never load or execute this assembly.
        using var input = File.OpenRead(Path.Combine(root!, "Quicker.dll"));
        using var pe = new PEReader(input);
        var metadata = pe.GetMetadataReader();
        TypeDefinition? Find(MetadataReader reader, string name) => reader.TypeDefinitions.Select(reader.GetTypeDefinition).Where(type =>
            reader.GetString(type.Namespace) == "Quicker.Designer.Plugin" && reader.GetString(type.Name) == name).Select(type => (TypeDefinition?)type).SingleOrDefault();
        var corePath = Path.Combine(root!, "Quicker.Headless.Core.dll");
        using var coreInput = File.Exists(corePath) ? File.OpenRead(corePath) : null;
        using var corePe = coreInput is null ? null : new PEReader(coreInput);
        var dtoReader = metadata;
        var dto = Find(metadata, "FaIconSearchPage");
        if (dto is null && corePe is not null) { dtoReader = corePe.GetMetadataReader(); dto = Find(dtoReader, "FaIconSearchPage"); }
        async Task AssertUnavailableAsync(string missing)
        {
            TestContext.WriteLine("The explicit compile host lacks " + missing + ". Only Quicker.dll and optional Quicker.Headless.Core.dll were inspected. Real native DTO/algorithm execution is unverified. No Quicker assembly was loaded.");
            Assert.IsNull(V2DesignerReadNativePort.FaPageBinding.TryCreate(null, null));
            Assert.IsFalse(new V2DesignerReadNativePort().IsFaPageAvailable);
            var refused = await new V2DesignerReadHost(PageNative(binding: () => null)).SearchFontAwesomeIconsPageAsync("", null);
            Assert.IsFalse(refused.Success); StringAssert.Contains(refused.ErrorMessage, "UNSUPPORTED_HOST");
        }
        if (dto is null) { await AssertUnavailableAsync("FaIconSearchPage in Quicker or its portable Core"); return; }
        var types = new MetadataTypes();
        var expected = new Dictionary<string, string> { ["Names"] = "System.Collections.Generic.IReadOnlyList`1<String>", ["TotalCount"] = "Int32", ["Skip"] = "Int32", ["Take"] = "Int32", ["HasMore"] = "Boolean", ["Query"] = "String", ["Style"] = "String" };
        foreach (var property in dto.Value.GetProperties().Select(dtoReader.GetPropertyDefinition))
            if (expected.Remove(dtoReader.GetString(property.Name), out var type)) Assert.AreEqual(type, property.DecodeSignature(types, null).ReturnType);
        Assert.AreEqual(0, expected.Count, "The native page DTO is missing required fields.");
        var resolver = Find(metadata, "QuickerPluginFontAwesomePathResolver");
        if (resolver is null) { await AssertUnavailableAsync("QuickerPluginFontAwesomePathResolver in Quicker"); return; }
        var search = resolver.Value.GetMethods().Select(metadata.GetMethodDefinition).Single(method => metadata.GetString(method.Name) == "SearchPage");
        Assert.AreEqual(MethodAttributes.Public | MethodAttributes.Static, search.Attributes & (MethodAttributes.MemberAccessMask | MethodAttributes.Static));
        Assert.AreEqual(0, search.GetGenericParameters().Count);
        var signature = search.DecodeSignature(types, null);
        Assert.AreEqual("Quicker.Designer.Plugin.FaIconSearchPage", signature.ReturnType);
        CollectionAssert.AreEqual(new[] { "String", "String", "Int32", "Int32" }, signature.ParameterTypes.ToArray());
        Assert.IsNull(System.Windows.Application.Current);
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
                    foreach (var key in new[] { QuickerRpcHostCapabilityNames.DesignerQuickInsertRead, QuickerRpcHostCapabilityNames.DesignerToolboxRead, QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve, QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead, QuickerRpcHostCapabilityNames.DesignerActionOpen, QuickerRpcHostCapabilityNames.DesignerSubProgramOpen, QuickerRpcHostCapabilityNames.DesignerContextRead })
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
    public sealed record FaPageDto(IReadOnlyList<string> Names, int TotalCount, int Skip, int Take, bool HasMore, string Query, string? Style);
    public static class FaPageLeaf
    {
        public static int Reads;
        public static Func<string, string, int, int, FaPageDto> Read = (_, _, _, _) => throw new AssertFailedException();
        public static FaPageDto SearchPage(string query, string style, int skip, int take) { Reads++; return Read(query, style, skip, take); }
    }
    public static class AsyncFaPageLeaf { public static Task<FaPageDto> SearchPage(string query, string style, int skip, int take) => throw new AssertFailedException(); }
    public static class GenericFaPageLeaf { public static FaPageDto SearchPage<T>(string query, string style, int skip, int take) => throw new AssertFailedException(); }
    public sealed record BadFaPageDto(IList<string> Names, int TotalCount, int Skip, int Take, bool HasMore, string Query, string? Style);
    public static class BadFaPageLeaf { public static BadFaPageDto SearchPage(string query, string style, int skip, int take) => throw new AssertFailedException(); }

    private sealed class MetadataTypes : ISignatureTypeProvider<string, object?>
    {
        public string GetPrimitiveType(PrimitiveTypeCode code) => code.ToString();
        public string GetTypeFromDefinition(MetadataReader reader, TypeDefinitionHandle handle, byte kind)
        { var type = reader.GetTypeDefinition(handle); return reader.GetString(type.Namespace) + "." + reader.GetString(type.Name); }
        public string GetTypeFromReference(MetadataReader reader, TypeReferenceHandle handle, byte kind)
        { var type = reader.GetTypeReference(handle); return reader.GetString(type.Namespace) + "." + reader.GetString(type.Name); }
        public string GetGenericInstantiation(string genericType, ImmutableArray<string> arguments) => genericType + "<" + string.Join(",", arguments) + ">";
        public string GetTypeFromSpecification(MetadataReader reader, object? context, TypeSpecificationHandle handle, byte kind) => reader.GetTypeSpecification(handle).DecodeSignature(this, context);
        public string GetSZArrayType(string elementType) => elementType + "[]";
        public string GetArrayType(string elementType, ArrayShape shape) => elementType + "[" + shape.Rank + "]";
        public string GetByReferenceType(string elementType) => elementType + "&";
        public string GetPointerType(string elementType) => elementType + "*";
        public string GetPinnedType(string elementType) => elementType;
        public string GetModifiedType(string modifier, string value, bool required) => value;
        public string GetGenericMethodParameter(object? context, int index) => "!!" + index;
        public string GetGenericTypeParameter(object? context, int index) => "!" + index;
        public string GetFunctionPointerType(MethodSignature<string> signature) => "function-pointer";
    }
    private sealed class MetadataAssembly(string name, Func<Type?> read) : Assembly
    {
        public int Reads;
        public override bool IsDynamic => false;
        public override AssemblyName GetName() => new(name);
        public override AssemblyName GetName(bool copiedName) => new(name);
        public override string Location => throw new AssertFailedException("Metadata lookup must not find or load satellite files.");
        public override Type[] GetTypes() => throw new AssertFailedException("Metadata lookup must not scan an entire assembly.");
        public override Type? GetType(string typeName, bool throwOnError, bool ignoreCase)
        { Assert.IsFalse(throwOnError); Assert.IsFalse(ignoreCase); Reads++; return read(); }
    }
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
