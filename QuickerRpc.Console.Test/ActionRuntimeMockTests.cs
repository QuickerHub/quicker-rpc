using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.ActionRuntime;
using QuickerRpc.Console.ActionRuntime.Mock;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeMockTests
{
    [TestMethod]
    public void MockRun_MultiVarInlineXAction_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:evalexpression",
                  "inputParams": {
                    "expression": {
                      "value": "{a} = Convert.ToDouble(1);\n{b} = Convert.ToDouble(2);\n{c} = {a} + {b}"
                    }
                  }
                },
                {
                  "stepRunnerKey": "sys:showText",
                  "inputParams": {
                    "content": { "var": "c" }
                  }
                }
              ],
              "variables": [
                { "key": "a", "type": "number" },
                { "key": "b", "type": "number" },
                { "key": "c", "type": "number" }
              ]
            }
            """;

        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: null,
            actionId: null,
            xactionInline: xaction,
            xactionFile: null,
            inputParam: null);
        Assert.IsTrue(build.Success, build.ErrorMessage);

        var profile = MockProfileLoader.Load("multi-var-assign", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "multi-var-assign",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }
}
