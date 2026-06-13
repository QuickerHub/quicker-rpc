using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.ActionRuntime.Mock;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class MockTraceDiffComparerTests
{
    [TestMethod]
    public void Compare_MatchingStepBeginSpines_ReturnsMatch()
    {
        var mock = new List<QuickerRpcActionTraceEvent>
        {
            new() { Kind = "step_begin", StepRunnerKey = "sys:evalexpression" },
            new() { Kind = "step_end", StepRunnerKey = "sys:evalexpression" },
        };
        var plugin = new List<QuickerRpcActionTraceEvent>
        {
            new() { Kind = "input", StepRunnerKey = "sys:evalexpression" },
            new() { Kind = "step_begin", StepRunnerKey = "sys:evalexpression" },
            new() { Kind = "output", StepRunnerKey = "sys:evalexpression" },
            new() { Kind = "step_end", StepRunnerKey = "sys:evalexpression" },
        };

        var diff = MockTraceDiffComparer.Compare(mock, plugin);

        Assert.IsTrue(diff.StepRunnerSpineMatch);
        Assert.AreEqual(1, diff.MockStepRunnerSpine.Count);
        Assert.AreEqual(1, diff.PluginStepRunnerSpine.Count);
    }

    [TestMethod]
    public void Compare_DifferentStepRunnerKeys_ReturnsMismatch()
    {
        var mock = new List<QuickerRpcActionTraceEvent>
        {
            new() { Kind = "step_begin", StepRunnerKey = "sys:notify" },
        };
        var plugin = new List<QuickerRpcActionTraceEvent>
        {
            new() { Kind = "step_begin", StepRunnerKey = "sys:msgbox" },
        };

        var diff = MockTraceDiffComparer.Compare(mock, plugin);

        Assert.IsFalse(diff.StepRunnerSpineMatch);
        Assert.AreEqual(0, diff.FirstMismatchIndex);
        CollectionAssert.Contains(diff.MockOnlyStepRunnerKeys.ToList(), "sys:notify");
        CollectionAssert.Contains(diff.PluginOnlyStepRunnerKeys.ToList(), "sys:msgbox");
    }
}
