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

    [TestMethod]
    public void MockRun_NotifySplitToListParam_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:notify",
                  "inputParams": {
                    "msg": { "value": "$={quicker_in_param}.SplitToList().FirstOrDefault()" },
                    "type": { "value": "Success" },
                    "maxLines": { "value": "0" },
                    "style": { "value": "Default" }
                  }
                }
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
        build.Package!.Options = new Quicker.ActionRuntime.Abstractions.RuntimeExecutionOptions
        {
            IsDebugging = true,
        };

        var profile = MockProfileLoader.Load("notify-toast-simple", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "notify-toast-simple",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockRun_ExternalSubProgramStub_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": {
                    "subProgram": { "value": "@@demo@0@wrapper_action" },
                    "stopIfFail": { "value": "1" }
                  }
                }
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

        var profile = MockProfileLoader.Load("subprogram-external-stub", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "subprogram-external-stub",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockRun_ChromeControlStub_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:chromecontrol",
                  "inputParams": {
                    "operation": { "value": "RunScript" },
                    "script": { "value": "console.log('mock');" },
                    "stopIfFail": { "value": "1" }
                  }
                }
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

        var profile = MockProfileLoader.Load("runtime-success", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "runtime-success",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockRun_KeyInputStub_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:keyInput",
                  "inputParams": {
                    "keys": { "value": "{\"CtrlKeys\":[162],\"Keys\":[68]}" }
                  }
                }
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

        var profile = MockProfileLoader.Load("runtime-success", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "runtime-success",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockRun_RunScriptStub_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:runScript",
                  "inputParams": {
                    "script": { "value": "curl --data name=test http://example.invalid" },
                    "type": { "value": "CMD_H" }
                  }
                }
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

        var profile = MockProfileLoader.Load("runtime-success", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "runtime-success",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockRun_SubProgramStubAll_PassesAssertions()
    {
        const string xaction = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": {
                    "subProgram": { "value": "embedded_core" },
                    "stopIfFail": { "value": "1" }
                  }
                }
              ],
              "subPrograms": [
                {
                  "name": "embedded_core",
                  "steps": [
                    {
                      "stepRunnerKey": "sys:getWindowTitle",
                      "inputParams": {
                        "stopIfFail": { "value": "1" }
                      }
                    }
                  ]
                }
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

        var profile = MockProfileLoader.Load("subprogram-stub-all", profileFile: null);
        var exitCode = ActionRuntimeMockCli.Run(
            build,
            profile,
            "subprogram-stub-all",
            json: false,
            runAssertions: true);

        Assert.AreEqual(ExitCodes.Success, exitCode);
    }

    [TestMethod]
    public void MockProfile_UserActionLikesTotal_LoadsHttpContentFiles()
    {
        var profile = MockProfileLoader.Load("user-action-likes-total", profileFile: null);
        Assert.IsNotNull(profile.Mocks?.Http);
        var page1 = profile.Mocks!.Http!["https://getquicker.net/User/Actions/113342-Cea"];
        Assert.IsNotNull(page1);
        Assert.IsFalse(string.IsNullOrWhiteSpace(page1.Content));
        StringAssert.Contains(page1.Content, "共 117 个动作");
        Assert.IsTrue(profile.Mocks.Http.ContainsKey("https://getquicker.net/User/Actions/113342-Cea?p=5"));
    }
}
