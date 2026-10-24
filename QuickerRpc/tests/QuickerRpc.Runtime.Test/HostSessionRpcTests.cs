using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class HostSessionRpcTests
{
    [TestMethod]
    public async Task Same_host_services_share_identity_but_new_hosts_and_bootstrap_scopes_do_not()
    {
        var host = new FakeHost();
        var first = await Service(host).GetHostSessionAsync();
        var second = await Service(host).GetHostSessionAsync();
        Assert.IsTrue(Guid.TryParseExact(first.HostSessionId, "N", out _));
        Assert.AreEqual(first.HostSessionId, second.HostSessionId);
        Assert.AreNotEqual(first.HostSessionId, (await Service(new FakeHost()).GetHostSessionAsync()).HostSessionId);

        var owner = new QuickerRpcHostSessionScope();
        var ownerSession = await Service(host, owner).GetHostSessionAsync();
        Assert.AreEqual(ownerSession.HostSessionId, (await Service(host, owner).GetHostSessionAsync()).HostSessionId);
        Assert.AreNotEqual(ownerSession.HostSessionId, (await Service(host, new QuickerRpcHostSessionScope()).GetHostSessionAsync()).HostSessionId,
            "A reloaded bootstrap changes identity even when an external host object is reused.");
    }

    [TestMethod]
    public async Task Reports_ports_instead_of_guessing_source_support_from_host_generation()
    {
        var host = new FakeHost { Info = new() { Kind = QuickerHostKind.V2, QuickerVersion = "2.test", AdapterAssembly = "fake-v2" } };
        var session = await Service(host).GetHostSessionAsync();
        Assert.AreEqual("qkrpc", session.Service);
        Assert.AreEqual(1, session.SchemaVersion);
        Assert.AreEqual(QuickerRpcService.CurrentProtocolVersion, session.ProtocolVersion);
        Assert.AreEqual("v2", session.Host.Kind);
        Assert.AreEqual("2.test", session.Host.QuickerVersion);
        Assert.AreEqual("fake-v2", session.Host.AdapterAssembly);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyRead]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyPatch]);
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ActionSourceRead]);
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ActionSourceWrite]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.ActionWriteDesignerOpenGuard]);
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);

        host.ActionPrograms = DispatchProxy.Create<ISourceProgram, NeverInvokePort>();
        Assert.IsTrue((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.ActionSourceRead]);
        host.Info.Kind = QuickerHostKind.V1;
        host.ActionPrograms = DispatchProxy.Create<IQuickerRpcActionProgramHost, NeverInvokePort>();
        Assert.IsFalse((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.ActionSourceWrite]);
        host.ActionPrograms = DispatchProxy.Create<IAvailableSourceProgram, SourceAvailabilityPort>();
        Assert.IsFalse((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.ActionSourceRead]);
        ((SourceAvailabilityPort)(object)host.ActionPrograms).Available = true;
        Assert.IsTrue((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.ActionSourceWrite]);
    }

    [TestMethod]
    public async Task Designer_capability_requires_a_port_and_declaration_and_is_distinct_from_save_guard()
    {
        var host = new FakeHost();
        host.Flags.DesignerUi = true;
        Assert.IsFalse((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.DesignerActionOpen]);
        host.Designer = DispatchProxy.Create<IQuickerRpcDesignerHost, NeverInvokePort>();
        var supported = await Service(host).GetHostSessionAsync();
        Assert.IsTrue(supported.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);
        Assert.IsTrue(supported.Capabilities[QuickerRpcHostCapabilityNames.DesignerActionOpen]);
        Assert.IsTrue(supported.Capabilities[QuickerRpcHostCapabilityNames.DesignerSubProgramOpen]);
        host.Flags.DesignerUi = false;
        var disabled = await Service(host).GetHostSessionAsync();
        Assert.IsFalse(disabled.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);
        Assert.IsTrue(disabled.Capabilities[QuickerRpcHostCapabilityNames.ActionWriteDesignerOpenGuard]);
    }

    [TestMethod]
    public async Task Returns_detached_snapshots_and_canceled_queries_do_not_inspect_ports()
    {
        var host = new FakeHost();
        var service = Service(host);
        var first = await service.GetHostSessionAsync();
        first.Host.Kind = "changed";
        first.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyRead] = false;
        var second = await service.GetHostSessionAsync();
        Assert.AreEqual("v1", second.Host.Kind);
        Assert.IsTrue(second.Capabilities[QuickerRpcHostCapabilityNames.ActionLegacyBodyRead]);
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        host.RefusePortReads = true;
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.GetHostSessionAsync(stop.Token));
    }

    [TestMethod]
    public async Task Independent_designer_reads_do_not_enable_editors_and_unknown_hosts_have_no_legacy_fallback()
    {
        var host = new FakeHost { Info = new() { Kind = QuickerHostKind.V2 } };
        var designer = DispatchProxy.Create<IAvailableDesigner, DesignerAvailabilityPort>();
        var reads = (DesignerAvailabilityPort)(object)designer;
        reads.QuickInsert = true; reads.Geometry = true;
        host.Designer = designer;
        var session = await Service(host).GetHostSessionAsync();
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerQuickInsertRead]);
        Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerToolboxRead]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve]);
        foreach (var key in new[] { QuickerRpcHostCapabilityNames.DesignerContextRead, QuickerRpcHostCapabilityNames.DesignerActionOpen, QuickerRpcHostCapabilityNames.DesignerSubProgramOpen })
            Assert.IsFalse(session.Capabilities[key]);

        host.Flags.DesignerUi = true;
        host.Designer = DispatchProxy.Create<IQuickerRpcDesignerHost, NeverInvokePort>();
        foreach (var kind in new[] { QuickerHostKind.V2, (QuickerHostKind)999 })
        {
            host.Info.Kind = kind;
            session = await Service(host).GetHostSessionAsync();
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerQuickInsertRead]);
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerToolboxRead]);
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve]);
        }
        host.Info.Kind = QuickerHostKind.V1;
        session = await Service(host).GetHostSessionAsync();
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerQuickInsertRead]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerToolboxRead]);
        Assert.IsTrue(session.Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomeResolve]);
        host.Designer = designer;
        Assert.IsFalse((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.DesignerToolboxRead], "Explicit availability wins over V1 compatibility.");
    }

    [TestMethod]
    public async Task FontAwesome_page_requires_an_actual_optional_port_and_never_enables_editor_access()
    {
        var host = new FakeHost();
        host.Flags.DesignerUi = true;
        host.Designer = DispatchProxy.Create<IQuickerRpcDesignerHost, NeverInvokePort>();
        Assert.IsFalse((await Service(host).GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead]);
        Assert.IsFalse((await Service(host).SearchFontAwesomeIconsPageAsync("", null)).Success);
        var designer = DispatchProxy.Create<IPageDesigner, PageDesignerPort>();
        var port = (PageDesignerPort)(object)designer;
        host.Designer = designer; host.Flags.DesignerUi = false; host.Info.Kind = QuickerHostKind.V2;
        var service = Service(host);
        Assert.IsFalse((await service.GetHostSessionAsync()).Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead]);
        Assert.IsFalse((await service.SearchFontAwesomeIconsPageAsync("", null)).Success); Assert.AreEqual(0, port.Calls);
        port.Available = true;
        var info = await service.GetHostSessionAsync();
        Assert.IsTrue(info.Capabilities[QuickerRpcHostCapabilityNames.DesignerFontAwesomePageRead]);
        Assert.IsFalse(info.Capabilities[QuickerRpcHostCapabilityNames.DesignerActionOpen]);
        Assert.IsFalse(info.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);
        var page = await service.SearchFontAwesomeIconsPageAsync("camera", "Light", 3, 9);
        Assert.IsTrue(page.Success); Assert.AreEqual(1, port.Calls); Assert.AreEqual("camera", page.Query); Assert.AreEqual(3, page.Skip); Assert.AreEqual(9, page.Take);
    }

    [TestMethod]
    public async Task FontAwesome_page_preabort_and_late_success_keep_the_original_token_and_other_requests_work()
    {
        var designer = DispatchProxy.Create<IPageDesigner, PageDesignerPort>();
        var port = (PageDesignerPort)(object)designer;
        var service = Service(new FakeHost { Designer = designer });
        using var before = new CancellationTokenSource(); before.Cancel();
        await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.SearchFontAwesomeIconsPageAsync("", null, cancellationToken: before.Token));
        Assert.AreEqual(0, port.AvailabilityReads); Assert.AreEqual(0, port.Calls);
        using var late = new CancellationTokenSource(); port.Available = true; port.OnRead = () => late.Cancel();
        var error = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.SearchFontAwesomeIconsPageAsync("", null, cancellationToken: late.Token));
        Assert.AreEqual(late.Token, error.CancellationToken);
        port.OnRead = null;
        Assert.IsTrue((await service.SearchFontAwesomeIconsPageAsync("other", null)).Success); Assert.AreEqual(2, port.Calls);
    }

    public interface IPageDesigner : IQuickerRpcDesignerHost, IQuickerRpcDesignerFontAwesomePageHost { }
    public class PageDesignerPort : DispatchProxy
    {
        public bool Available; public int Calls, AvailabilityReads; public Action? OnRead;
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            if (method?.Name == "get_IsFontAwesomePageAvailable") { AvailabilityReads++; return Available; }
            if (method?.Name == nameof(IQuickerRpcDesignerFontAwesomePageHost.SearchFontAwesomeIconsPageAsync))
            {
                Calls++; OnRead?.Invoke();
                return Task.FromResult(new QuickerRpcFontAwesomePageResult { Success = true, Query = (string?)args![0] ?? "", Style = (string?)args[1], Skip = (int)args[2]!, Take = (int)args[3]! });
            }
            throw new AssertFailedException("Unexpected page host method: " + method?.Name);
        }
    }

    private static QuickerRpcService Service(FakeHost host, QuickerRpcHostSessionScope? scope = null)
    {
        var dependencies = new QuickerRpcRuntimeDependencies(() => throw new AssertFailedException("Handshake must not build a catalog."), "fake");
        return new(host, new NeverSchedule(), new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies), scope);
    }

    public interface ISourceProgram : IQuickerRpcActionProgramHost, IQuickerRpcActionProgramSourceHost { }
    public interface IAvailableDesigner : IQuickerRpcDesignerHost, IQuickerRpcDesignerReadAvailability { }
    public class DesignerAvailabilityPort : DispatchProxy
    {
        public bool QuickInsert, Toolbox, Geometry;
        protected override object? Invoke(MethodInfo? method, object?[]? args) => method?.Name switch
        {
            "get_IsStepQuickInsertAvailable" => QuickInsert,
            "get_IsToolboxModulesAvailable" => Toolbox,
            "get_IsFontAwesomeGeometryAvailable" => Geometry,
            _ => throw new AssertFailedException("Availability must not call a native read: " + method?.Name),
        };
    }
    public interface IAvailableSourceProgram : ISourceProgram, IQuickerRpcActionProgramSourceAvailability { }
    public class SourceAvailabilityPort : DispatchProxy
    {
        public bool Available { get; set; }
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod!.Name == "get_IsProgramSourceAvailable"
            ? Available : throw new AssertFailedException("Unexpected source method.");
    }
    public class NeverInvokePort : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => throw new AssertFailedException("Handshake invoked host method " + targetMethod?.Name);
    }
    private sealed class FakeHost : IQuickerRpcHost
    {
        private IQuickerRpcActionProgramHost programs = DispatchProxy.Create<IQuickerRpcActionProgramHost, NeverInvokePort>();
        public bool RefusePortReads { get; set; }
        public QuickerRpcHostInfo Info { get; set; } = new() { Kind = QuickerHostKind.V1 };
        public Flags Flags { get; } = new();
        public IQuickerRpcHostCapabilities Capabilities => Flags;
        public IQuickerRpcActionProgramHost ActionPrograms { get => RefusePortReads ? throw new AssertFailedException("Canceled handshake inspected ports") : programs; set => programs = value; }
        public IQuickerRpcDesignerHost? Designer { get; set; }
        public IQuickerRpcSessionHost Session => throw new AssertFailedException();
        public IQuickerRpcActionSharingHost ActionSharing => throw new AssertFailedException();
        public IQuickerRpcSubProgramHost SubPrograms => throw new AssertFailedException();
        public IQuickerRpcActionRunHost ActionRuns => throw new AssertFailedException();
        public IQuickerRpcActionCatalogHost ActionCatalog => throw new AssertFailedException();
        public IQuickerRpcSearchHost Search => throw new AssertFailedException();
        public IQuickerRpcSettingsHost Settings => throw new AssertFailedException();
        public IQuickerRpcActionDocHost ActionDocs => throw new AssertFailedException();
        public IQuickerRpcStepRunnerHost StepRunners => throw new AssertFailedException();
        public IQuickerRpcExpressionHost Expressions => throw new AssertFailedException();
        public IQuickerRpcChromeControlHost? ChromeControl => null;
        public IQuickerRpcTriggerHost? Triggers => null;
        public IQuickerRpcLauncherHost? Launcher => null;
    }
    private sealed class Flags : IQuickerRpcHostCapabilities
    {
        public bool DesignerUi { get; set; }
        public bool EnforcesDesignerOpenGuard => true;
        public bool ChromeControl => false;
        public bool Triggers => false;
        public bool Launcher => false;
    }
    private sealed class NeverSchedule : IQuickerRpcCallScheduler
    {
        public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) => throw new AssertFailedException();
        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) => throw new AssertFailedException();
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => throw new AssertFailedException();
    }
    private sealed class NoFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) => throw new AssertFailedException();
        public void Error(string message) => throw new AssertFailedException();
    }
}
