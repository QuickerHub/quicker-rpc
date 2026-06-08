using System.Collections.Generic;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class InterpolationPrefixLintTests
{
    [TestMethod]
    public void Analyze_warns_when_defined_var_in_literal_without_double_dollar()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "lineCount", ["type"] = "integer" },
            },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-msg",
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject
                        {
                            ["value"] =
                                "剪贴板行数 (Before)：{lineCount}\n剪切板行数 (After)：{lineCount}",
                        },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.IsTrue(issues.Count >= 2);
        Assert.IsTrue(issues.All(i => i.Severity == ProgramSyntaxIssueSeverity.Warning));
        Assert.IsTrue(issues.All(i => i.Code == "MISSING_INTERPOLATION_PREFIX"));
        Assert.AreEqual("message", issues[0].Location.ParamName);
        Assert.AreEqual("0", issues[0].Location.StepPath);
        Assert.IsNotNull(issues[0].LocationSummary);
        Assert.IsTrue(issues[0].LocationSummary!.Contains("workspace_program"));
        Assert.IsTrue(issues[0].LocationSummary.Contains("read_data"));
    }

    [TestMethod]
    public void Analyze_skips_when_double_dollar_prefix_present()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "userName" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject { ["value"] = "$$Hello {userName}" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(0, issues.Count);
    }

    [TestMethod]
    public void Analyze_skips_undefined_variable_braces()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "lineCount" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject { ["value"] = "x {notAVariable}" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(0, issues.Count);
    }

    [TestMethod]
    public void Analyze_skips_dollar_eq_prefix_even_with_defined_var()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "lineCount" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject { ["value"] = "$={lineCount} > 0" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(0, issues.Count);
    }

    [TestMethod]
    public void Analyze_warns_on_variable_default_without_prefix()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = "greeting",
                    ["type"] = "text",
                    ["defaultValue"] = "Hello {userName}",
                },
                new JObject { ["key"] = "userName", ["type"] = "text" },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(1, issues.Count);
        Assert.AreEqual("MISSING_INTERPOLATION_PREFIX", issues[0].Code);
        Assert.AreEqual("defaultValue", issues[0].Location.ParamName);
        Assert.AreEqual("greeting", issues[0].Location.VariableKey);
    }

    [TestMethod]
    public void Analyze_skips_script_and_code_params()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "lineCount" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:csscript",
                    ["inputParams"] = new JObject
                    {
                        ["script"] = new JObject { ["value"] = "var n = {lineCount};" },
                        ["code"] = new JObject { ["value"] = "return {lineCount};" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(0, issues.Count);
    }

    [TestMethod]
    public void Analyze_warns_inside_nested_if_steps()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "flag", ["type"] = "boolean" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:if",
                    ["ifSteps"] = new JArray
                    {
                        new JObject
                        {
                            ["stepRunnerKey"] = "sys:MsgBox",
                            ["inputParams"] = new JObject
                            {
                                ["message"] = new JObject { ["value"] = "Flag={flag}" },
                            },
                        },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(1, issues.Count);
        Assert.AreEqual("0/if/0", issues[0].Location.StepPath);
    }

    [TestMethod]
    public void Analyze_skips_expression_param_even_with_defined_var()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "lineCount" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:evalexpression",
                    ["inputParams"] = new JObject
                    {
                        ["expression"] = new JObject { ["value"] = "{lineCount} + 1" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        Assert.AreEqual(0, issues.Count);
    }
}
