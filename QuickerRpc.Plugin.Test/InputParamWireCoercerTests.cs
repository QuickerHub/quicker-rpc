using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class InputParamWireCoercerTests
{
    [TestMethod]
    public void WriteData_persists_compact_wire_keys_and_ReadData_expands()
    {
        var dir = Path.Combine(Path.GetTempPath(), "qkrpc-wire-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:evalexpression",
                        ["inputParams"] = new JObject
                        {
                            ["expression"] = new JObject { ["value"] = "1+1" },
                            ["code"] = new JObject { ["file"] = "files/main.eval.cs" },
                            ["outputVar"] = new JObject { ["varKey"] = "lineCount" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"expression\": \"1+1\"");
            StringAssert.Contains(json, "\"code.file\": \"files/main.eval.cs\"");
            StringAssert.Contains(json, "\"outputVar.var\": \"lineCount\"");
            Assert.IsFalse(json.Contains("\"value\""));
            Assert.IsFalse(json.Contains("\"varKey\""));

            var loaded = QuickerProjectFiles.ReadData(dir);
            var inputParams = loaded["steps"]![0]!["inputParams"] as JObject;
            Assert.AreEqual("1+1", inputParams!["expression"]!["value"]!.Value<string>());
            Assert.AreEqual("files/main.eval.cs", inputParams["code"]!["file"]!.Value<string>());
            Assert.AreEqual("lineCount", inputParams["outputVar"]!["varKey"]!.Value<string>());
        }
        finally
        {
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, true);
            }
        }
    }
}
