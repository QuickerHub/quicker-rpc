using System.Collections.Generic;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Plugin.Debugging;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ActionTraceLocationResolverTests
{
    [TestMethod]
    public void ResolveFailureLocation_maps_error_to_step_path_by_step_id()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-1",
                ["stepRunnerKey"] = "sys:getClipboardText",
            },
            new JObject
            {
                ["stepId"] = "s-2",
                ["stepRunnerKey"] = "sys:evalexpression",
                ["inputParams"] = new JObject { ["expression"] = "$=bad" },
            },
        };

        var events = new List<QuickerRpcActionTraceEvent>
        {
            new()
            {
                Kind = "step_begin",
                StepId = "s-2",
                StepRunnerKey = "sys:evalexpression",
                StepPath = "1",
            },
            new()
            {
                Kind = "input",
                StepId = "s-2",
                StepPath = "1",
                ParamKey = "expression",
            },
            new()
            {
                Kind = "error",
                StepId = "s-2",
                StepPath = "1",
                Message = "表达式计算失败",
            },
        };

        var location = ActionTraceLocationResolver.ResolveFailureLocation(events, steps);
        Assert.IsNotNull(location);
        Assert.AreEqual("1", location!.StepPath);
        Assert.AreEqual("steps[1].inputParams.expression", location.DataJsonPointer);
        Assert.AreEqual("stepId", location.MatchMethod);
    }

    [TestMethod]
    public void ResolveFailureLocation_falls_back_to_runner_sequence_without_disk_step_id()
    {
        var steps = new JArray
        {
            new JObject { ["stepRunnerKey"] = "sys:getClipboardText" },
            new JObject { ["stepRunnerKey"] = "sys:evalexpression" },
        };

        var events = new List<QuickerRpcActionTraceEvent>
        {
            new() { Kind = "step_begin", StepId = "runtime-1", StepRunnerKey = "sys:getClipboardText" },
            new() { Kind = "step_begin", StepId = "runtime-2", StepRunnerKey = "sys:evalexpression", StepPath = "1" },
            new() { Kind = "error", StepId = "runtime-2", StepPath = "1", Message = "failed" },
        };

        var location = ActionTraceLocationResolver.ResolveFailureLocation(events, steps);
        Assert.IsNotNull(location);
        Assert.AreEqual("1", location!.StepPath);
        Assert.AreEqual("stepRunnerSequence", location.MatchMethod);
    }

    [TestMethod]
    public void BuildDataJsonPointer_includes_param_when_present()
    {
        Assert.AreEqual(
            "steps[0/if/0].inputParams.expression",
            ActionTraceLocationResolver.BuildDataJsonPointer("0/if/0", "expression"));
        Assert.AreEqual(
            "steps[1]",
            ActionTraceLocationResolver.BuildDataJsonPointer("1", null));
    }

    [TestMethod]
    public void WalkProgramSteps_traverses_if_and_else_branches()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:if",
                ["ifSteps"] = new JArray
                {
                    new JObject { ["stepId"] = "s-inner", ["stepRunnerKey"] = "sys:msgbox" },
                },
                ["elseSteps"] = new JArray
                {
                    new JObject { ["stepRunnerKey"] = "sys:delay" },
                },
            },
        };

        var entries = ActionTraceLocationResolver.WalkProgramSteps(steps);
        Assert.AreEqual(3, entries.Count);
        Assert.AreEqual("0", entries[0].NodePath);
        Assert.AreEqual("0/if/0", entries[1].NodePath);
        Assert.AreEqual("s-inner", entries[1].StepId);
        Assert.AreEqual("0/else/0", entries[2].NodePath);
    }

    [TestMethod]
    public void BuildStepIdToPathMap_indexes_disk_step_ids()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-expr",
                ["stepRunnerKey"] = "sys:evalexpression",
            },
        };

        var map = ActionTraceLocationResolver.BuildStepIdToPathMap(steps);
        Assert.IsTrue(map.TryGetValue("s-expr", out var path));
        Assert.AreEqual("0", path);
    }

    [TestMethod]
    public void ResolveFailureLocation_normalizes_loop_iteration_step_id_suffix()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-expr",
                ["stepRunnerKey"] = "sys:evalexpression",
            },
        };

        var events = new List<QuickerRpcActionTraceEvent>
        {
            new()
            {
                Kind = "step_begin",
                StepId = "s-expr-0",
                StepRunnerKey = "sys:evalexpression",
            },
            new()
            {
                Kind = "error",
                StepId = "s-expr-0",
                Message = "failed",
            },
        };

        var location = ActionTraceLocationResolver.ResolveFailureLocation(events, steps);
        Assert.IsNotNull(location);
        Assert.AreEqual("0", location!.StepPath);
    }

    [TestMethod]
    public void ResolveFailureLocation_uses_fallback_error_message_without_error_event()
    {
        var steps = new JArray
        {
            new JObject { ["stepRunnerKey"] = "sys:evalexpression" },
        };

        var events = new List<QuickerRpcActionTraceEvent>
        {
            new()
            {
                Kind = "step_begin",
                StepId = "runtime-1",
                StepRunnerKey = "sys:evalexpression",
                StepPath = "0",
            },
        };

        var location = ActionTraceLocationResolver.ResolveFailureLocation(
            events,
            steps,
            fallbackErrorMessage: "run failed without error event");
        Assert.IsNotNull(location);
        Assert.AreEqual("0", location!.StepPath);
        Assert.AreEqual("run failed without error event", location.Message);
    }
}
