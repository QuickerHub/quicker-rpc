using System.Reflection;
using System.Runtime.Loader;
using Newtonsoft.Json.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Plugin.V2.Adapters;
using System.Windows.Threading;

namespace QuickerRpc.Runtime.Test;

/// <summary>Opt-in host DLL fixture: real compiled Plugin.V2 and real DTO, fake repositories only.</summary>
[TestClass]
public sealed class V2CompiledActionSourceTests
{
    [TestMethod]
    public async Task Compiled_source_port_dispatches_to_owned_UI_thread_and_cancels_before_enqueue()
    {
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        var dispatcher = await ready.Task.WaitAsync(TimeSpan.FromSeconds(5));
        try
        {
            var owner = await V2ActionProgramHost.DispatchSourceOn(dispatcher, () => Environment.CurrentManagedThreadId, () => -1, default);
            Assert.AreEqual(thread.ManagedThreadId, owner);
            using var cts = new CancellationTokenSource();
            await cts.CancelAsync();
            Assert.ThrowsException<OperationCanceledException>(() => V2ActionProgramHost.DispatchSourceOn(dispatcher,
                () => throw new AssertFailedException("Canceled write ran."), () => -1, cts.Token));
            Assert.AreEqual(-1, await V2ActionProgramHost.DispatchSourceOn(null, () => 1, () => -1, default));
        }
        finally { dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal); Assert.IsTrue(thread.Join(TimeSpan.FromSeconds(5))); }
    }

    [TestMethod]
    public void Compiled_adapter_roundtrips_using_actual_Quicker_XActionDto_validation()
    {
        var root = Environment.GetEnvironmentVariable("QKRPC_V2_TEST_HOST_ROOT");
        if (string.IsNullOrWhiteSpace(root)) Assert.Inconclusive("Set QKRPC_V2_TEST_HOST_ROOT to an explicit compile host directory; no host data is read.");
        Assert.AreNotEqual("QuickerRpc.Runtime.Test", typeof(V2ActionProgramSourceService).Assembly.GetName().Name,
            "This acceptance fixture must exercise the compiled Plugin.V2 project, not source links.");
        Assembly? Resolve(AssemblyLoadContext context, AssemblyName name)
        {
            if (!(name.Name?.StartsWith("Quicker.", StringComparison.Ordinal) ?? false)) return null;
            var path = Path.Combine(root!, name.Name + ".dll");
            return File.Exists(path) ? context.LoadFromAssemblyPath(path) : null;
        }
        AssemblyLoadContext.Default.Resolving += Resolve;
        try
        {
            var common = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(root!, "Quicker.Common.dll"));
            var dto = common.GetType("Quicker.Common.ActionPayloads.XAction.XActionDto", throwOnError: true)!;
            var fixture = new V2ActionSourceTests.Fixture(payloadType: dto);
            var read = fixture.Read();
            Assert.IsTrue(read.Success, read.ErrorMessage);
            var body = V2ActionSourceTests.Parse(read.BodyJson!);
            body["Steps"]![0]!["Note"] = "compiled adapter + native DTO";
            var saved = fixture.Save(read, body);
            Assert.IsTrue(saved.Success, saved.ErrorMessage);
            Assert.AreEqual(true, saved.Persisted);
            var after = fixture.Read();
            Assert.AreEqual("compiled adapter + native DTO", V2ActionSourceTests.Parse(after.BodyJson!)["Steps"]![0]!["Note"]!.Value<string>());
            body["Steps"]![0]!["DelayMs"] = "not-an-int";
            Assert.AreEqual("INVALID_PROGRAM", fixture.Save(after, body).ErrorCode);
        }
        finally { AssemblyLoadContext.Default.Resolving -= Resolve; }
    }
}
