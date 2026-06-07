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
    }

    [TestMethod]
    public void Analyze_warns_undefined_variable_in_dollar_eq_param()
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

        Assert.IsTrue(issues.Any(i => i.Code == "UNDEFINED_VARIABLE_IN_EXPRESSION"));
    }
}
