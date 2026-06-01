using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Validation;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepInputParamsValidatorTests
{
    private static StepRunnerCatalog CreateMsgBoxCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:MsgBox",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new() { Key = "msg" },
                        new() { Key = "title" },
                    },
                },
            },
        };

    [TestMethod]
    public void CollectWarnings_unknown_key_includes_valid_keys_and_suggestion()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepId"] = "s-1",
                ["stepRunnerKey"] = "sys:MsgBox",
                ["inputParams"] = new JObject
                {
                    ["content"] = new JObject { ["value"] = "hello" },
                },
            },
        };

        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateMsgBoxCatalog());
        Assert.AreEqual(1, warnings.Count);
        StringAssert.Contains(warnings[0], "content");
        StringAssert.Contains(warnings[0], "msg");
        StringAssert.Contains(warnings[0], "step-runner get --key sys:MsgBox");
    }

    [TestMethod]
    public void CollectWarnings_empty_when_keys_valid()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:MsgBox",
                ["inputParams"] = new JObject
                {
                    ["Msg"] = new JObject { ["value"] = "hi" },
                },
            },
        };

        var catalog = CreateMsgBoxCatalog();
        XActionProgramService.NormalizeStepsInputParamKeys(steps, catalog);
        var warnings = XActionProgramService.CollectStepsInputParamsWarnings(steps, catalog);
        Assert.AreEqual(0, warnings.Count);
    }

    [TestMethod]
    public void CollectWarnings_skips_null_inputParams_values()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:MsgBox",
                ["inputParams"] = new JObject
                {
                    ["msg"] = new JObject { ["value"] = "ok" },
                    ["title"] = JValue.CreateNull(),
                },
            },
        };

        Assert.AreEqual(0, StepInputParamsValidator.CollectWarnings(steps, CreateMsgBoxCatalog()).Count);
    }

    [TestMethod]
    public void CollectWarnings_includes_nested_ifSteps()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["ifSteps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-inner",
                        ["stepRunnerKey"] = "sys:MsgBox",
                        ["inputParams"] = new JObject
                        {
                            ["badKey"] = new JObject { ["value"] = "x" },
                        },
                    },
                },
            },
        };

        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateMsgBoxCatalog());
        Assert.AreEqual(1, warnings.Count);
        StringAssert.Contains(warnings[0], "s-inner");
        StringAssert.Contains(warnings[0], "badKey");
    }
}
