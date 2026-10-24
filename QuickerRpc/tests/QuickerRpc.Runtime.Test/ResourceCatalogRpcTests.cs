using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Runtime;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class ResourceCatalogRpcTests
{
    [TestMethod]
    public async Task Resource_capabilities_are_independent_root_ports_and_do_not_require_designer_ui()
    {
        var host = new CatalogHost { ActionAvailable = true };
        var service = Service(host);
        var first = await service.GetHostSessionAsync();
        Assert.IsTrue(first.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsFalse(first.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        Assert.IsFalse(first.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);

        host.ActionAvailable = false;
        host.SubProgramAvailable = true;
        host.Flags.DesignerUi = true;
        host.Designer = DispatchProxy.Create<IQuickerRpcDesignerHost, NeverInvokePort>();
        var second = await service.GetHostSessionAsync();
        Assert.IsFalse(second.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsTrue(second.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        Assert.IsTrue(second.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);

        host.SubProgramAvailable = false;
        var disabled = await service.GetHostSessionAsync();
        Assert.IsFalse(disabled.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsFalse(disabled.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);

        host.ActionAvailable = true;
        host.SubProgramAvailable = true;
        host.Flags.DesignerUi = false;
        host.Designer = null;
        var started = await service.GetHostSessionAsync();
        Assert.IsTrue(started.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
        Assert.IsTrue(started.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
        Assert.IsFalse(started.Capabilities[QuickerRpcHostCapabilityNames.DesignerContextRead]);
        Assert.AreEqual(0, host.ReadCalls, "A handshake must not capture or enumerate a resource catalog.");
        CollectionAssert.AreEqual(new[] { "action", "global_subprogram", "action", "global_subprogram", "action", "global_subprogram", "action", "global_subprogram" }, host.AvailabilityKinds);
    }

    [TestMethod]
    public async Task Hosts_without_optional_port_report_false_and_refuse_both_reads_without_legacy_fallback()
    {
        foreach (var kind in new[] { QuickerHostKind.V1, QuickerHostKind.V2, (QuickerHostKind)999 })
        {
            var host = new FakeHost { Info = new() { Kind = kind } };
            host.Flags.DesignerUi = true;
            host.Designer = DispatchProxy.Create<IQuickerRpcDesignerHost, NeverInvokePort>();
            var service = Service(host);
            var session = await service.GetHostSessionAsync();
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ResourceActionPageRead]);
            Assert.IsFalse(session.Capabilities[QuickerRpcHostCapabilityNames.ResourceGlobalSubProgramPageRead]);
            foreach (var reader in Readers(service))
            {
                var result = await reader.Read(new(), default);
                AssertFailure(result, reader.Kind, "UNSUPPORTED_HOST");
            }
        }
    }

    [TestMethod]
    public async Task Invalid_requests_fail_before_any_availability_or_catalog_call()
    {
        var host = new CatalogHost { ActionAvailable = true, SubProgramAvailable = true };
        foreach (var reader in Readers(Service(host)))
        {
            foreach (var request in new QuickerRpcResourceCatalogPageRequest?[]
            {
                null,
                new() { Scope = "allSqlRows" },
                new() { Scope = null! },
            })
                AssertFailure(await reader.Read(request!, default), reader.Kind, "INVALID_RESOURCE_CATALOG_REQUEST");
            foreach (var snapshot in new string?[] { null, "", "  " })
                AssertFailure(await reader.Read(new() { Skip = 1, ExpectedSnapshotId = snapshot }, default), reader.Kind, "SNAPSHOT_REQUIRED");
        }
        Assert.AreEqual(0, host.AvailabilityKinds.Count);
        Assert.AreEqual(0, host.ReadCalls);
    }

    [TestMethod]
    public async Task Pre_canceled_requests_preserve_original_token_and_do_not_probe_the_host()
    {
        var host = new CatalogHost { ActionAvailable = true, SubProgramAvailable = true, RefuseRootReads = true };
        var service = Service(host);
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        foreach (var reader in Readers(service))
        {
            var canceled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => reader.Read(new(), stop.Token));
            Assert.AreEqual(stop.Token, canceled.CancellationToken);
        }
        var handshakeCanceled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => service.GetHostSessionAsync(stop.Token));
        Assert.AreEqual(stop.Token, handshakeCanceled.CancellationToken);
        Assert.AreEqual(0, host.AvailabilityKinds.Count);
        Assert.AreEqual(0, host.ReadCalls);
    }

    [TestMethod]
    public async Task Narrow_methods_forward_normalized_requests_tokens_and_all_wire_facts()
    {
        var host = new CatalogHost { ActionAvailable = true, SubProgramAvailable = true };
        using var stop = new CancellationTokenSource();
        host.OnRead = (kind, request, token) =>
        {
            Assert.AreEqual(stop.Token, token);
            Assert.AreEqual("runtimeCatalog", request.Scope);
            Assert.AreEqual("stored title", request.Query);
            Assert.AreEqual(500, request.Take);
            Assert.AreEqual("capture-123", request.ExpectedSnapshotId);
            return Task.FromResult(new QuickerRpcResourceCatalogPageResult
            {
                Success = true, Kind = kind, Scope = request.Scope, Query = request.Query!,
                Skip = request.Skip, Take = request.Take, TotalCount = 1234, HasMore = true, SnapshotId = "capture-123",
                Items = new List<QuickerRpcResourceCatalogItem>
                {
                    new()
                    {
                        Id = "resource-id", Title = "stored title", Description = "stored description",
                        Icon = "fa:Light_Folder:#80112233", EditVersion = "9223372036854775807",
                        ActionType = kind == "action" ? "XAction" : null,
                        CallIdentifier = kind == "global_subprogram" ? "sub:literal-id" : null,
                    },
                },
            });
        };

        var index = 0;
        foreach (var reader in Readers(Service(host)))
        {
            var request = new QuickerRpcResourceCatalogPageRequest
            {
                Scope = " runtimeCatalog ", Query = " stored title ", Skip = index == 0 ? -7 : 500,
                Take = index == 0 ? int.MaxValue : 0, ExpectedSnapshotId = " capture-123 ",
            };
            var result = await reader.Read(request, stop.Token);
            Assert.IsTrue(result.Success);
            Assert.AreEqual(reader.Kind, result.Kind);
            Assert.AreEqual("runtimeCatalog", result.Scope);
            Assert.AreEqual("stored title", result.Query);
            Assert.AreEqual(index == 0 ? 0 : 500, result.Skip);
            Assert.AreEqual(500, result.Take);
            Assert.AreEqual(1234, result.TotalCount);
            Assert.IsTrue(result.HasMore);
            Assert.AreEqual("capture-123", result.SnapshotId);
            Assert.IsNull(result.ErrorCode);
            Assert.IsNull(result.ErrorMessage);
            Assert.AreEqual(1, result.Items.Count);
            var item = result.Items[0];
            Assert.AreEqual("resource-id", item.Id);
            Assert.AreEqual("stored title", item.Title);
            Assert.AreEqual("stored description", item.Description);
            Assert.AreEqual("fa:Light_Folder:#80112233", item.Icon);
            Assert.AreEqual("9223372036854775807", item.EditVersion);
            Assert.AreEqual(index == 0 ? "XAction" : null, item.ActionType);
            Assert.AreEqual(index == 1 ? "sub:literal-id" : null, item.CallIdentifier);
            Assert.AreEqual(" runtimeCatalog ", request.Scope);
            Assert.AreEqual(" stored title ", request.Query);
            Assert.AreEqual(index == 0 ? -7 : 500, request.Skip);
            Assert.AreEqual(index == 0 ? int.MaxValue : 0, request.Take);
            Assert.AreEqual(" capture-123 ", request.ExpectedSnapshotId);
            index++;
        }
        CollectionAssert.AreEqual(new[] { "action", "global_subprogram" }, host.AvailabilityKinds);
        Assert.AreEqual(2, host.ReadCalls);
    }

    [TestMethod]
    public async Task Unavailable_kind_is_refused_independently_without_reading_the_other_catalog()
    {
        var host = new CatalogHost { SubProgramAvailable = true };
        var service = Service(host);
        AssertFailure(await service.GetActionResourceCatalogPageAsync(new()), "action", "UNSUPPORTED_HOST");
        Assert.AreEqual(0, host.ReadCalls);
        Assert.IsTrue((await service.GetGlobalSubProgramResourceCatalogPageAsync(new())).Success);
        Assert.AreEqual(1, host.ReadCalls);
        CollectionAssert.AreEqual(new[] { "action", "global_subprogram" }, host.AvailabilityKinds);
    }

    [TestMethod]
    public async Task Native_structured_failures_and_exceptions_are_not_replaced_with_successful_empty_pages()
    {
        var host = new CatalogHost { ActionAvailable = true, SubProgramAvailable = true };
        foreach (var reader in Readers(Service(host)))
        {
            host.OnRead = (kind, _, _) => Task.FromResult(new QuickerRpcResourceCatalogPageResult
            {
                Success = false, Kind = kind, ErrorCode = "CATALOG_CHANGED", ErrorMessage = "Owned capture was invalidated.",
            });
            var failed = await reader.Read(new() { Skip = 500, ExpectedSnapshotId = "old-capture" }, default);
            AssertFailure(failed, reader.Kind, "CATALOG_CHANGED");
            Assert.AreEqual("Owned capture was invalidated.", failed.ErrorMessage);

            host.OnRead = (_, _, _) => throw new InvalidOperationException("native enumeration failed");
            var exception = await Assert.ThrowsExceptionAsync<InvalidOperationException>(() => reader.Read(new(), default));
            Assert.AreEqual("native enumeration failed", exception.Message);
        }
        Assert.AreEqual(4, host.ReadCalls);
    }

    [TestMethod]
    public async Task Cancellation_after_native_reply_prevents_success_publication_and_keeps_original_token()
    {
        foreach (var kind in new[] { "action", "global_subprogram" })
        {
            using var stop = new CancellationTokenSource();
            var host = new CatalogHost { ActionAvailable = true, SubProgramAvailable = true };
            host.OnRead = (selected, _, _) =>
            {
                stop.Cancel();
                return Task.FromResult(new QuickerRpcResourceCatalogPageResult { Success = true, Kind = selected });
            };
            var reader = Readers(Service(host)).Single(candidate => candidate.Kind == kind);
            var canceled = await Assert.ThrowsExceptionAsync<OperationCanceledException>(() => reader.Read(new(), stop.Token));
            Assert.AreEqual(stop.Token, canceled.CancellationToken);
            Assert.AreEqual(1, host.ReadCalls);
        }
        var unrelated = new CatalogHost { ActionAvailable = true };
        Assert.IsTrue((await Service(unrelated).GetActionResourceCatalogPageAsync(new())).Success);
    }

    private static IEnumerable<(string Kind, Func<QuickerRpcResourceCatalogPageRequest, CancellationToken, Task<QuickerRpcResourceCatalogPageResult>> Read)> Readers(QuickerRpcService service)
    {
        yield return ("action", service.GetActionResourceCatalogPageAsync);
        yield return ("global_subprogram", service.GetGlobalSubProgramResourceCatalogPageAsync);
    }

    private static void AssertFailure(QuickerRpcResourceCatalogPageResult result, string kind, string code)
    {
        Assert.IsFalse(result.Success);
        Assert.AreEqual(kind, result.Kind);
        Assert.AreEqual(code, result.ErrorCode);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.ErrorMessage));
        Assert.AreEqual(0, result.Items.Count);
        Assert.AreEqual(0, result.TotalCount);
        Assert.IsFalse(result.HasMore);
        Assert.IsNull(result.SnapshotId);
    }

    private static QuickerRpcService Service(IQuickerRpcHost host)
    {
        var dependencies = new QuickerRpcRuntimeDependencies(
            () => throw new AssertFailedException("Resource pages must not build the search index."), "fake");
        return new(host, new NeverSchedule(), new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies));
    }

    private sealed class CatalogHost : FakeHost, IQuickerRpcResourceCatalogPageHost
    {
        public bool ActionAvailable { get; set; }
        public bool SubProgramAvailable { get; set; }
        public List<string> AvailabilityKinds { get; } = new();
        public int ReadCalls { get; private set; }
        public Func<string, QuickerRpcResourceCatalogPageRequest, CancellationToken, Task<QuickerRpcResourceCatalogPageResult>>? OnRead { get; set; }
        public bool CanRead(string kind)
        {
            AvailabilityKinds.Add(kind);
            return kind switch
            {
                "action" => ActionAvailable,
                "global_subprogram" => SubProgramAvailable,
                _ => throw new AssertFailedException("Unexpected resource kind: " + kind),
            };
        }
        public Task<QuickerRpcResourceCatalogPageResult> GetResourceCatalogPageAsync(string kind,
            QuickerRpcResourceCatalogPageRequest request, CancellationToken cancellationToken = default)
        {
            ReadCalls++;
            return OnRead?.Invoke(kind, request, cancellationToken)
                ?? Task.FromResult(new QuickerRpcResourceCatalogPageResult { Success = true, Kind = kind });
        }
    }

    private class FakeHost : IQuickerRpcHost
    {
        private QuickerRpcHostInfo info = new() { Kind = QuickerHostKind.V1 };
        private IQuickerRpcDesignerHost? designer;
        private readonly IQuickerRpcActionProgramHost programs = DispatchProxy.Create<IQuickerRpcActionProgramHost, NeverInvokePort>();
        public bool RefuseRootReads { get; set; }
        public Flags Flags { get; } = new();
        public QuickerRpcHostInfo Info { get => Check(info); set => info = value; }
        public IQuickerRpcHostCapabilities Capabilities => Check(Flags);
        public IQuickerRpcActionProgramHost ActionPrograms => Check(programs);
        public IQuickerRpcDesignerHost? Designer { get => Check(designer); set => designer = value; }
        private T Check<T>(T value) => RefuseRootReads ? throw new AssertFailedException("Canceled request inspected a host port.") : value;
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

    public class NeverInvokePort : DispatchProxy
    {
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
            throw new AssertFailedException("Unexpected native port call: " + targetMethod?.Name);
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
