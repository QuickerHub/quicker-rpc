using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramBranchStructureLintTests
{
    [TestMethod]
    public void Analyze_warns_ifSteps_on_leaf_step()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:getClipboardText",
                    ["ifSteps"] = new JArray
                    {
                        new JObject { ["stepRunnerKey"] = "sys:delay" },
                    },
                },
            },
        };

        var issues = ProgramBranchStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "INVALID_BRANCH_FIELD" && i.Location.ParamName == "ifSteps"));
    }

    [TestMethod]
    public void Analyze_warns_elseSteps_on_non_if_runner()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:simpleIf",
                    ["elseSteps"] = new JArray
                    {
                        new JObject { ["stepRunnerKey"] = "sys:delay" },
                    },
                },
            },
        };

        var issues = ProgramBranchStructureLint.Analyze(data);

        Assert.IsTrue(issues.Any(i => i.Code == "INVALID_BRANCH_FIELD" && i.Location.ParamName == "elseSteps"));
    }

    [TestMethod]
    public void Analyze_accepts_sys_if_with_if_and_else_children()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:if",
                    ["ifSteps"] = new JArray
                    {
                        new JObject { ["stepRunnerKey"] = "sys:delay" },
                    },
                    ["elseSteps"] = new JArray
                    {
                        new JObject { ["stepRunnerKey"] = "sys:MsgBox" },
                    },
                },
            },
        };

        var issues = ProgramBranchStructureLint.Analyze(data);
        Assert.AreEqual(0, issues.Count);
    }

    [TestMethod]
    public void Analyze_ignores_empty_branch_arrays()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["ifSteps"] = new JArray(),
                    ["elseSteps"] = new JArray(),
                },
            },
        };

        var issues = ProgramBranchStructureLint.Analyze(data);
        Assert.AreEqual(0, issues.Count);
    }
}
