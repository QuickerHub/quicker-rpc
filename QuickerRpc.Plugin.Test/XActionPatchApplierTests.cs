using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class XActionPatchApplierTests
{
    [TestMethod]
    public void Add_step_without_position_appends_to_root_end()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-1",
                ["stepRunnerKey"] = "sys:MsgBox",
            },
        };
        var variables = new JArray();

        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:Delay",
                    ["inputParams"] = new JObject
                    {
                        ["milliseconds"] = new JObject { ["value"] = "100" },
                    },
                },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(2, steps.Count);
        Assert.AreEqual("s-1", steps[0]!["stepId"]!.Value<string>());
        Assert.AreEqual("sys:Delay", steps[1]!["stepRunnerKey"]!.Value<string>());
        Assert.AreEqual(1, result.AddedSteps.Count);
    }

    [TestMethod]
    public void Full_steps_without_replace_flag_appends_not_replaces()
    {
        var steps = new JArray
        {
            new JObject { ["stepId"] = "s-old", ["stepRunnerKey"] = "sys:MsgBox" },
        };
        var variables = new JArray();

        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject { ["id"] = "s-1", ["stepRunnerKey"] = "sys:notify" },
                new JObject { ["id"] = "s-2", ["stepRunnerKey"] = "sys:notify" },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(3, steps.Count);
    }

    [TestMethod]
    public void Replace_true_clears_then_writes_steps_and_variables()
    {
        var steps = new JArray
        {
            new JObject { ["stepId"] = "s-old", ["stepRunnerKey"] = "sys:MsgBox" },
        };
        var variables = new JArray
        {
            new JObject { ["id"] = "v-old", ["key"] = "old", ["type"] = 0 },
        };

        var patch = new JObject
        {
            ["replace"] = true,
            ["steps"] = new JArray
            {
                new JObject { ["stepRunnerKey"] = "sys:notify" },
            },
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "rpc_text", ["type"] = 0, ["defaultValue"] = "hello" },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(1, steps.Count);
        Assert.AreEqual("sys:notify", steps[0]!["stepRunnerKey"]!.Value<string>());
        Assert.AreEqual(1, variables.Count);
        Assert.AreEqual("rpc_text", variables[0]!["key"]!.Value<string>());
    }

    [TestMethod]
    public void Replace_true_requires_both_arrays()
    {
        var steps = new JArray();
        var variables = new JArray();

        var patch = new JObject
        {
            ["replace"] = true,
            ["steps"] = new JArray(),
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage, "steps and variables");
    }

    [TestMethod]
    public void Add_step_explicit_op_still_works()
    {
        var steps = new JArray();
        var variables = new JArray();

        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["op"] = "add",
                    ["stepRunnerKey"] = "sys:MsgBox",
                },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(1, steps.Count);
    }

    [TestMethod]
    public void Add_step_legacy_nested_step_object_still_works()
    {
        var steps = new JArray();
        var variables = new JArray();

        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["op"] = "add",
                    ["step"] = new JObject
                    {
                        ["stepRunnerKey"] = "sys:MsgBox",
                    },
                },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(1, steps.Count);
        Assert.AreEqual("sys:MsgBox", steps[0]!["stepRunnerKey"]!.Value<string>());
    }

    [TestMethod]
    public void Add_step_with_containerPath_only_appends_to_branch_end()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-1",
                ["stepRunnerKey"] = "sys:if",
                ["ifSteps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-2",
                        ["stepRunnerKey"] = "sys:MsgBox",
                    },
                },
            },
        };
        var variables = new JArray();

        var patch = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["op"] = "add",
                    ["containerPath"] = "0/if",
                    ["stepRunnerKey"] = "sys:Delay",
                },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        var ifSteps = steps[0]!["ifSteps"] as JArray;
        Assert.IsNotNull(ifSteps);
        Assert.AreEqual(2, ifSteps!.Count);
        Assert.AreEqual("sys:MsgBox", ifSteps[0]!["stepRunnerKey"]!.Value<string>());
        Assert.AreEqual("sys:Delay", ifSteps[1]!["stepRunnerKey"]!.Value<string>());
    }

    [TestMethod]
    public void Add_variable_without_anchor_appends_to_end()
    {
        var steps = new JArray();
        var variables = new JArray
        {
            new JObject { ["id"] = "v-1", ["key"] = "a", ["type"] = "string" },
        };

        var patch = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["op"] = "add",
                    ["key"] = "b",
                    ["type"] = "string",
                    ["defaultValue"] = "2",
                },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(2, variables.Count);
        Assert.AreEqual("b", variables[1]!["key"]!.Value<string>());
    }

    [TestMethod]
    public void Patch_single_variable_without_type_updates_not_replaces()
    {
        var steps = new JArray();
        var variables = new JArray
        {
            new JObject { ["id"] = "v-1", ["key"] = "a", ["type"] = 0, ["defaultValue"] = "1" },
            new JObject { ["id"] = "v-2", ["key"] = "b", ["type"] = 0, ["defaultValue"] = "2" },
        };

        var patch = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "a", ["defaultValue"] = "updated" },
            },
        };

        var result = XActionProgramService.ApplyPatch(steps, variables, patch);

        Assert.IsTrue(result.Success, result.ErrorMessage);
        Assert.AreEqual(2, variables.Count);
        Assert.AreEqual("updated", variables[0]!["defaultValue"]!.Value<string>());
        Assert.AreEqual("2", variables[1]!["defaultValue"]!.Value<string>());
    }
}
