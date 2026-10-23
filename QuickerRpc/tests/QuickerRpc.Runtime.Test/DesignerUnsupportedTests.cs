using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class DesignerUnsupportedTests
{
    [TestMethod]
    public async Task Missing_designer_returns_existing_typed_failures_without_scheduling_or_another_host()
    {
        var service = Service();
        Assert.IsFalse((await service.EditActionAsync("fixture")).Ok);
        Assert.IsFalse((await service.EditGlobalSubProgramAsync("fixture")).Ok);
        Assert.IsFalse((await service.SearchStepQuickInsertAsync("fixture", 0, null)).Success);
        Assert.IsFalse((await service.SearchToolboxModulesAsync("fixture", 0)).Success);
        Assert.IsFalse((await service.ReadClipboardSpecialFormatAsync("fixture")).Success);
        Assert.IsFalse((await service.WriteClipboardSpecialFormatAsync("fixture", "content")).Success);
        Assert.IsFalse((await service.SearchFontAwesomeIconsAsync("fixture")).Success);
        var icons = await service.ResolveFontAwesomeIconsAsync(["fa:Light_Fixture"]);
        Assert.IsFalse(icons.Success); StringAssert.Contains(icons.ErrorMessage, "UNSUPPORTED_HOST"); Assert.AreEqual(0, icons.Items.Count);
        Assert.IsFalse((await service.GetActionDesignerContextAsync()).Ok);
        var text = await service.RunTextToolAsync("fixture");
        Assert.IsFalse(text.Ok); Assert.AreEqual("UNSUPPORTED_HOST", text.ErrorCode);
    }

    [TestMethod]
    public async Task Already_canceled_designer_requests_do_not_inspect_any_host_port()
    {
        var service = Service(refuseReads: true);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel(); var token = cancellation.Token;
        foreach (var invoke in new Func<Task>[] {
            () => service.EditActionAsync("fixture", token), () => service.EditGlobalSubProgramAsync("fixture", token),
            () => service.SearchStepQuickInsertAsync("", 0, null, token), () => service.SearchToolboxModulesAsync("", 0, token),
            () => service.ReadClipboardSpecialFormatAsync("fixture", token), () => service.WriteClipboardSpecialFormatAsync("fixture", "", token),
            () => service.SearchFontAwesomeIconsAsync("", cancellationToken: token), () => service.ResolveFontAwesomeIconsAsync([], token),
            () => service.GetActionDesignerContextAsync(cancellationToken: token), () => service.RunTextToolAsync("fixture", cancellationToken: token),
        }) await Assert.ThrowsExceptionAsync<OperationCanceledException>(invoke);
    }

    private static QuickerRpcService Service(bool refuseReads = false)
    {
        var host = DispatchProxy.Create<IQuickerRpcHost, NoDesignerHost>(); ((NoDesignerHost)(object)host).RefuseReads = refuseReads;
        var dependencies = new QuickerRpcRuntimeDependencies(() => throw new AssertFailedException("Catalog must not be built."), "fake");
        return new(host, new NoScheduler(), new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies));
    }
    public class NoDesignerHost : DispatchProxy
    {
        public bool RefuseReads;
        protected override object? Invoke(MethodInfo? method, object?[]? args) => !RefuseReads && method!.Name == "get_Designer"
            ? null : throw new AssertFailedException("Unexpected host read: " + method?.Name);
    }
    private sealed class NoScheduler : IQuickerRpcCallScheduler
    {
        public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> work, CancellationToken token = default) => throw new AssertFailedException("No dispatcher may run.");
        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> work, CancellationToken token = default) => throw new AssertFailedException("No background work may run.");
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> work) => throw new AssertFailedException();
    }
    private sealed class NoFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) => throw new AssertFailedException();
        public void Error(string message) => throw new AssertFailedException();
    }
}
