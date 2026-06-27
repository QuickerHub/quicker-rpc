using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Host;
using QuickerRpc.Runtime;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class QuickerRpcServiceTests
{
    [TestMethod]
    public async Task PingAsync_returns_pong()
    {
        var service = CreateService();

        var pong = await service.PingAsync(CancellationToken.None);

        Assert.AreEqual("pong", pong);
    }

    [TestMethod]
    public async Task GetProtocolVersionAsync_returns_current()
    {
        var service = CreateService();

        var version = await service.GetProtocolVersionAsync(CancellationToken.None);

        Assert.AreEqual(QuickerRpcService.CurrentProtocolVersion, version);
    }

    private static QuickerRpcService CreateService()
    {
        var deps = new QuickerRpcRuntimeDependencies(() => new StepRunnerCatalog(), "test");
        return new QuickerRpcService(
            new StubQuickerRpcHost(),
            new InlineCallScheduler(),
            new NoOpUserFeedback(),
            new ActionProgramRpcHandler(deps),
            new SubProgramRpcHandler(deps));
    }

    private sealed class StubQuickerRpcHost : IQuickerRpcHost
    {
        public QuickerRpcHostInfo Info { get; } = new() { Kind = QuickerHostKind.V1, QuickerVersion = "test" };

        public IQuickerRpcHostCapabilities Capabilities { get; } = new StubCapabilities();

        public IQuickerRpcSessionHost Session => throw new System.NotImplementedException();

        public IQuickerRpcActionProgramHost ActionPrograms => throw new System.NotImplementedException();

        public IQuickerRpcActionSharingHost ActionSharing => throw new System.NotImplementedException();

        public IQuickerRpcSubProgramHost SubPrograms => throw new System.NotImplementedException();

        public IQuickerRpcActionRunHost ActionRuns => throw new System.NotImplementedException();

        public IQuickerRpcActionCatalogHost ActionCatalog => throw new System.NotImplementedException();

        public IQuickerRpcSearchHost Search => throw new System.NotImplementedException();

        public IQuickerRpcSettingsHost Settings => throw new System.NotImplementedException();

        public IQuickerRpcActionDocHost ActionDocs => throw new System.NotImplementedException();

        public IQuickerRpcStepRunnerHost StepRunners => throw new System.NotImplementedException();

        public IQuickerRpcExpressionHost Expressions => throw new System.NotImplementedException();

        public IQuickerRpcChromeControlHost? ChromeControl => null;

        public IQuickerRpcTriggerHost? Triggers => null;

        public IQuickerRpcDesignerHost? Designer => null;

        public IQuickerRpcLauncherHost? Launcher => null;
    }

    private sealed class StubCapabilities : IQuickerRpcHostCapabilities
    {
        public bool ChromeControl => false;

        public bool Triggers => false;

        public bool DesignerUi => false;

        public bool Launcher => false;

        public bool EnforcesDesignerOpenGuard => false;
    }

    private sealed class InlineCallScheduler : IQuickerRpcCallScheduler
    {
        public Task<T> InvokeOnUiThreadAsync<T>(System.Func<Task<T>> action, CancellationToken cancellationToken = default) =>
            action();

        public Task<T> InvokeOffUiThreadAsync<T>(System.Func<T> action, CancellationToken cancellationToken = default) =>
            Task.FromResult(action());

        public T? InvokeOnUiThreadIfNeeded<T>(System.Func<T?> action) => action();
    }

    private sealed class NoOpUserFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) { }

        public void Error(string message) { }
    }
}
