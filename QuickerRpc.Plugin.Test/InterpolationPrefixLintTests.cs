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
