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

    private static StepRunnerCatalog CreateSubProgramCatalog() =>
        new()
        {
            Items = new List<StepRunnerDefinition>
            {
                new()
                {
                    Key = "sys:subprogram",
                    InputParamDefs = new List<StepRunnerInputParamDef>
                    {
                        new() { Key = "subProgram" },
                        new() { Key = "summary" },
                        new() { Key = "skipDebugOutput" },
                        new() { Key = "stopIfFail" },
                    },
                },
            },
        };

    [TestMethod]
    public void CollectWarnings_subprogram_var_keys_allowed_when_embedded_io_resolved()
    {
        var embeddedSubPrograms = new JArray
        {
            new JObject
            {
                ["id"] = "sp-1",
                ["name"] = "DialogSp",
                ["variables"] = new JArray
                {
                    new JObject { ["key"] = "markdown", ["isInput"] = true },
                    new JObject { ["key"] = "title", ["isInput"] = true },
                    new JObject { ["key"] = "buttons", ["isInput"] = true },
                },
            },
        };

        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = "DialogSp",
                    ["var:markdown"] = new JObject { ["varKey"] = "md" },
                    ["var:title"] = new JObject { ["varKey"] = "dlgTitle" },
                    ["var:buttons"] = new JObject { ["varKey"] = "btns" },
                },
            },
        };

        var context = new StepInputParamsValidationContext { EmbeddedSubPrograms = embeddedSubPrograms };
        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateSubProgramCatalog(), context);
        Assert.AreEqual(0, warnings.Count);
    }

    [TestMethod]
    public void CollectWarnings_subprogram_var_keys_skipped_when_target_unresolved()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = "%%unknown-guid",
                    ["var:markdown"] = new JObject { ["varKey"] = "md" },
                },
            },
        };

        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateSubProgramCatalog());
        Assert.AreEqual(0, warnings.Count);
    }

    [TestMethod]
    public void CollectWarnings_subprogram_unknown_var_key_when_io_resolved()
    {
        var embeddedSubPrograms = new JArray
        {
            new JObject
            {
                ["id"] = "sp-1",
                ["variables"] = new JArray
                {
                    new JObject { ["key"] = "text", ["isInput"] = true },
                },
            },
        };

        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = "sp-1",
                    ["var:markdown"] = new JObject { ["varKey"] = "md" },
                },
            },
        };

        var context = new StepInputParamsValidationContext { EmbeddedSubPrograms = embeddedSubPrograms };
        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateSubProgramCatalog(), context);
        Assert.AreEqual(1, warnings.Count);
        StringAssert.Contains(warnings[0], "var:markdown");
        StringAssert.Contains(warnings[0], "var:text");
    }

    [TestMethod]
    public void CollectWarnings_subprogram_static_unknown_key_still_warns()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = "DialogSp",
                    ["badStaticKey"] = "x",
                },
            },
        };

        var warnings = StepInputParamsValidator.CollectWarnings(steps, CreateSubProgramCatalog());
        Assert.AreEqual(1, warnings.Count);
        StringAssert.Contains(warnings[0], "badStaticKey");
    }

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
