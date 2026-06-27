using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramStructureLintTests
{
    [TestMethod]
    public void Analyze_reports_duplicate_step_id()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-dup",
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject(),
                },
                new JObject
                {
                    ["stepId"] = "s-dup",
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject(),
                },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "DUPLICATE_STEP_ID"));
        Assert.AreEqual(ProgramSyntaxIssueSeverity.Error, issues.First(i => i.Code == "DUPLICATE_STEP_ID").Severity);
    }

    [TestMethod]
    public void Analyze_reports_duplicate_step_id_across_branch_children()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "shared",
                    ["stepRunnerKey"] = "sys:if",
                    ["ifSteps"] = new JArray
                    {
                        new JObject { ["stepId"] = "shared", ["stepRunnerKey"] = "sys:MsgBox" },
                    },
                },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "DUPLICATE_STEP_ID"));
        Assert.AreEqual("0/if/0", issues.First(i => i.Code == "DUPLICATE_STEP_ID").Location.StepPath);
    }

    [TestMethod]
    public void Analyze_warns_missing_step_runner()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-1",
                    ["inputParams"] = new JObject(),
                },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "MISSING_STEP_RUNNER"));
        Assert.AreEqual(ProgramSyntaxIssueSeverity.Warning, issues.First(i => i.Code == "MISSING_STEP_RUNNER").Severity);
    }

    [TestMethod]
    public void Analyze_warns_missing_variable_key()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["type"] = "integer" },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "MISSING_VARIABLE_KEY"));
    }

    [TestMethod]
    public void Analyze_reports_duplicate_variable_key()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "count", ["type"] = "integer" },
                new JObject { ["key"] = "count", ["type"] = "integer" },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "DUPLICATE_VARIABLE_KEY"));
        Assert.AreEqual(ProgramSyntaxIssueSeverity.Error, issues.First(i => i.Code == "DUPLICATE_VARIABLE_KEY").Severity);
    }

    [TestMethod]
    public void Analyze_does_not_static_scan_undefined_expression_variables()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "known", ["type"] = "integer" },
            },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-1",
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject { ["value"] = "$= {missing} + 1" },
                    },
                },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsFalse(issues.Any(i => i.Code == "UNDEFINED_VARIABLE_IN_EXPRESSION"));
    }

    [TestMethod]
    public void Analyze_does_not_flag_regex_unicode_escapes_in_dollar_eq()
    {
        var data = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "text", ["type"] = "text" },
            },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-regex",
                    ["stepRunnerKey"] = "sys:evalexpression",
                    ["inputParams"] = new JObject
                    {
                        ["expression"] = new JObject
                        {
                            ["value"] = "$= Regex.IsMatch({text}, @\"[\\p{L}\\p{N}_]+\")",
                        },
                    },
                },
            },
        };

        var issues = ProgramStructureLint.Analyze(data);

        Assert.IsFalse(issues.Any(i => i.Code == "UNDEFINED_VARIABLE_IN_EXPRESSION"));
    }
}
