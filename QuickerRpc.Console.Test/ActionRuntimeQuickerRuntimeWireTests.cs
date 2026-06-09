using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Proto;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeQuickerRuntimeWireTests
{
    [TestMethod]
    public void ExpandInputParams_PreservesPascalCaseValue()
    {
        var inputParams = new JObject
        {
            ["subProgram"] = new JObject
            {
                ["VarKey"] = JValue.CreateNull(),
                ["Value"] = "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322",
            },
        };

        InputParamWireCoercer.ExpandInputParamsObject(inputParams);

        Assert.AreEqual(
            "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322",
            inputParams["subProgram"]!["value"]?.Value<string>());
        Assert.IsNull(inputParams["subProgram"]!["Value"]);
    }

    [TestMethod]
    public void BuildFromQuickerCompressed_PreservesPascalCaseRuntimeInputParams()
    {
        const string quickerRuntime = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": {
                    "subProgram": { "VarKey": null, "Value": "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322" },
                    "stopIfFail": { "VarKey": null, "Value": "1" },
                    "skipDebugOutput": { "VarKey": null, "Value": "0" },
                    "summary": { "VarKey": null, "Value": "" }
                  },
                  "outputParams": { "isSuccess": null, "errMessage": null }
                }
              ],
              "variables": []
            }
            """;

        var build = ActionRuntimePackageBuilder.BuildFromQuickerCompressed(
            "test-action",
            "Test",
            quickerRuntime,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        StringAssert.Contains(build.SourceProgramJson!, "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322");
        StringAssert.Contains(build.SourceProgramJson!, "\"stopIfFail\": \"1\"");
        StringAssert.Contains(build.SourceProgramJson!, "\"skipDebugOutput\": \"0\"");
        Assert.IsFalse(build.SourceProgramJson!.Contains("\"summary\"", StringComparison.Ordinal));
        Assert.IsTrue(
            build.Package!.Program!.Steps[0].InputParams.TryGetValue("subProgram", out var sub),
            "subProgram param missing");
        Assert.AreEqual("%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322", sub!.Value);
    }
}
