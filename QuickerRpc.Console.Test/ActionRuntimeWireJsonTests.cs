using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Console.ActionRuntime;

namespace QuickerRpc.Console.Test;

[TestClass]
public sealed class ActionRuntimeWireJsonTests
{
    [TestMethod]
    public void FormatMinimalWireProgramJson_CompactsInputParamsAndVariables()
    {
        const string canonical = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:assign",
                  "disabled": false,
                  "inputParams": {
                    "input": { "value": "ok" }
                  },
                  "outputParams": { "output": "result" }
                }
              ],
              "variables": [
                { "key": "result", "defaultValue": "", "isOutput": false, "id": "v-1" }
              ]
            }
            """;

        var wire = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(JToken.Parse(canonical));

        StringAssert.Contains(wire, "\"input\": \"ok\"");
        Assert.IsFalse(wire.Contains("\"value\"", StringComparison.Ordinal));
        Assert.IsFalse(wire.Contains("\"disabled\"", StringComparison.Ordinal));
        Assert.IsFalse(wire.Contains("\"defaultValue\"", StringComparison.Ordinal));
    }

    [TestMethod]
    public void FormatMinimalWireProgramJson_CompactsVarKeyBinding()
    {
        const string canonical = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:readFile",
                  "inputParams": {
                    "path": { "varKey": "path" }
                  },
                  "outputParams": { "txt": "content" }
                }
              ],
              "variables": [{ "key": "path", "defaultValue": "D:\\\\a.txt" }]
            }
            """;

        var wire = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(JToken.Parse(canonical));

        StringAssert.Contains(wire, "\"path.var\": \"path\"");
        StringAssert.Contains(wire, "\"default\":");
        StringAssert.Contains(wire, "a.txt");
    }

    [TestMethod]
    public void FormatMinimalWireProgramJson_CanOmitSubProgramBodies()
    {
        const string json = """
            {
              "steps": [
                {
                  "stepRunnerKey": "sys:subprogram",
                  "inputParams": { "subProgram": { "value": "Inner" } }
                }
              ],
              "subPrograms": [
                {
                  "name": "Inner",
                  "steps": [
                    {
                      "stepRunnerKey": "sys:assign",
                      "inputParams": { "input": { "value": "nested" } }
                    }
                  ],
                  "variables": []
                }
              ]
            }
            """;

        var display = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(
            JToken.Parse(json),
            omitSubProgramBodies: true);
        var full = ActionRuntimeCompileArtifacts.FormatMinimalWireProgramJson(JToken.Parse(json));

        StringAssert.Contains(display, "\"subProgram\": \"Inner\"");
        Assert.IsFalse(display.Contains("\"subPrograms\"", StringComparison.Ordinal));
        StringAssert.Contains(full, "\"subPrograms\"");
        StringAssert.Contains(full, "\"nested\"");
    }
}
