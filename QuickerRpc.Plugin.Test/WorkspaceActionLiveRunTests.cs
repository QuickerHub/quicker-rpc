using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Live closed-loop: load workspace disk program → apply to sandbox → trace run → restore.
/// Requires Quicker + QuickerRpc plugin (same as QuickerRpc.Test).
/// </summary>
[TestClass]
public sealed class WorkspaceActionLiveRunTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task LiveRun_fixture_via_sandbox_trace_succeeds()
    {
        await using var session = await WorkspaceActionLiveTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(20);

        var load = LoadDefaultFixture();
        Assert.IsTrue(load.Success, load.ErrorMessage);

        var (trace, sandboxId) = await WorkspaceActionLiveRunner
            .RunAsync(session.Rpc, load.Project!, cancellationToken: ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"sandbox={sandboxId} ok={trace.Ok} events={trace.EventCount} duration={trace.DurationMs}ms");
        if (!trace.Ok)
        {
            TestContext.WriteLine(trace.ErrorMessage ?? trace.Message);
        }

        Assert.IsTrue(trace.Ok, trace.ErrorMessage ?? trace.Message);
        Assert.IsTrue(trace.EventCount > 0, "trace should emit step events");
        Assert.IsTrue(
            trace.Events.Any(e => string.Equals(e.StepRunnerKey, "sys:evalexpression", StringComparison.OrdinalIgnoreCase)),
            "trace should include evalexpression step");
    }

    [TestMethod]
    public async Task LiveRun_repo_workspace_action_when_configured()
    {
        var actionKey = WorkspaceActionTestSettings.WorkspaceActionKey;
        if (actionKey is null)
        {
            Assert.Inconclusive("Set QKRPC_WORKSPACE_TEST_ACTION to run a repo .quicker/actions project live.");
        }

        await using var session = await WorkspaceActionLiveTestHelper.ConnectOrInconclusiveAsync(TestContext);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(20);

        var load = WorkspaceActionTestEnvironment.TryLoad(actionKey, WorkspaceActionTestSettings.WorkspaceRoot);
        Assert.IsTrue(load.Success, load.ErrorMessage);

        var options = new WorkspaceActionLiveRunner.RunOptions
        {
            TargetActionId = WorkspaceActionTestSettings.LiveTargetActionId,
            RestoreSandboxBodyAfterRun = WorkspaceActionTestSettings.LiveTargetActionId is null,
        };

        var (trace, targetId) = await WorkspaceActionLiveRunner
            .RunAsync(session.Rpc, load.Project!, options, ct)
            .ConfigureAwait(false);

        TestContext.WriteLine($"target={targetId} project={load.Project!.RelativeDirectory} ok={trace.Ok}");
        Assert.IsTrue(trace.Ok, trace.ErrorMessage ?? trace.Message);
    }

    private static WorkspaceActionTestEnvironment.LoadResult LoadDefaultFixture()
    {
        var dir = System.IO.Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "Fixtures",
            "workspace-actions",
            WorkspaceActionTestSettings.FixtureName);
        return WorkspaceActionTestEnvironment.TryLoadFromDirectory(dir);
    }
}
