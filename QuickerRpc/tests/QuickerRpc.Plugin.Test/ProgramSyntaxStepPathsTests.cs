using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramSyntaxStepPathsTests
{
    [TestMethod]
    public void Walk_emits_patch_style_paths_for_branches()
    {
        var steps = new JArray
        {
            new JObject { ["stepId"] = "root", ["stepRunnerKey"] = "sys:delay" },
            new JObject
            {
                ["stepId"] = "branch",
                ["stepRunnerKey"] = "sys:if",
                ["ifSteps"] = new JArray
                {
                    new JObject { ["stepId"] = "inner", ["stepRunnerKey"] = "sys:msgbox" },
                },
                ["elseSteps"] = new JArray
                {
                    new JObject { ["stepRunnerKey"] = "sys:delay" },
                },
            },
        };

        var paths = new System.Collections.Generic.List<string>();
        ProgramSyntaxStepPaths.Walk(
            steps,
            (_, stepPath, _, _) => paths.Add(stepPath));

        CollectionAssert.AreEqual(
            new[] { "0", "1", "1/if/0", "1/else/0" },
            paths);
    }
}
