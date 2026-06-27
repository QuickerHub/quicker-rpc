using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Composition;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class PluginV2CompositionTests
{
    [TestMethod]
    public void AddQuickerRpcPluginV2_registers_rpc_service()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddQuickerRpcPluginV2(new StubV2Host());

        using var provider = services.BuildServiceProvider();
        var rpc = provider.GetRequiredService<IQuickerRpcService>();
        Assert.IsNotNull(rpc);
        Assert.IsInstanceOfType(rpc, typeof(QuickerRpcService));
    }

    [TestMethod]
    public void AddQuickerRpcPluginV2_registers_server_host()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddQuickerRpcPluginV2(new StubV2Host());

        using var provider = services.BuildServiceProvider();
        var hosted = provider.GetServices<IHostedService>();
        Assert.IsTrue(hosted.Any(s => s.GetType().FullName!.Contains("QuickerRpcServerHost")));
    }

    private sealed class StubV2Host : IQuickerRpcHost
    {
        public QuickerRpcHostInfo Info { get; } = new()
        {
            Kind = QuickerHostKind.V2,
            QuickerVersion = "test",
            AdapterAssembly = "Quicker.Infrastructure.Test",
        };

        public IQuickerRpcHostCapabilities Capabilities { get; } = new StubV2Capabilities();

        public IQuickerRpcSessionHost Session => throw new NotImplementedException();

        public IQuickerRpcActionProgramHost ActionPrograms => throw new NotImplementedException();

        public IQuickerRpcActionSharingHost ActionSharing => throw new NotImplementedException();

        public IQuickerRpcSubProgramHost SubPrograms => throw new NotImplementedException();

        public IQuickerRpcActionRunHost ActionRuns => throw new NotImplementedException();

        public IQuickerRpcActionCatalogHost ActionCatalog => throw new NotImplementedException();

        public IQuickerRpcSearchHost Search => throw new NotImplementedException();

        public IQuickerRpcSettingsHost Settings => throw new NotImplementedException();

        public IQuickerRpcActionDocHost ActionDocs => throw new NotImplementedException();

        public IQuickerRpcStepRunnerHost StepRunners => throw new NotImplementedException();

        public IQuickerRpcExpressionHost Expressions => throw new NotImplementedException();

        public IQuickerRpcChromeControlHost? ChromeControl => null;

        public IQuickerRpcTriggerHost? Triggers => null;

        public IQuickerRpcDesignerHost? Designer => null;

        public IQuickerRpcLauncherHost? Launcher => null;
    }

    private sealed class StubV2Capabilities : IQuickerRpcHostCapabilities
    {
        public bool ChromeControl => false;

        public bool Triggers => false;

        public bool DesignerUi => false;

        public bool Launcher => false;

        public bool EnforcesDesignerOpenGuard => false;
    }
}
