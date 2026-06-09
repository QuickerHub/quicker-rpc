using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeInputParamNormalizeTests
{
    [TestMethod]
    public void PackageBuilder_ExpandsWireVarKey_OnParse()
    {
        const string json = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:readFile",
                  "inputParams": {
                    "path.var": "path"
                  },
                  "outputParams": { "txt": "content" }
                }
              ],
              "variables": [{ "key": "path", "defaultValue": "D:\\\\a.txt" }]
            }
            """;

        var build = ActionRuntimePackageBuilder.Build(
            packageFile: null,
            projectDir: null,
            actionId: null,
            xactionInline: json,
            xactionFile: null,
            inputParam: null);

        Assert.IsTrue(build.Success, build.ErrorMessage);
        Assert.IsTrue(
            build.Package!.Program!.Steps[0].InputParams.TryGetValue("path", out var pathParam),
            "expected expanded path param");
        Assert.AreEqual("path", pathParam!.VarKey);
    }
}
