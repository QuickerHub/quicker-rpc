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

    [TestMethod]
    public void WriteData_persists_typed_boolean_and_number_literals()
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
                        ["stepRunnerKey"] = "sys:http",
                        ["inputParams"] = new JObject
                        {
                            ["stopIfFail"] = new JObject { ["value"] = true },
                            ["expireSeconds"] = new JObject { ["value"] = 100 },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"stopIfFail\": true");
            StringAssert.Contains(json, "\"expireSeconds\": 100");

            var loaded = QuickerProjectFiles.ReadData(dir);
            var inputParams = loaded["steps"]![0]!["inputParams"] as JObject;
            Assert.AreEqual(true, inputParams!["stopIfFail"]!["value"]!.Value<bool>());
            Assert.AreEqual(100, inputParams["expireSeconds"]!["value"]!.Value<int>());
        }
        finally
        {
            if (Directory.Exists(dir))
            {
                Directory.Delete(dir, true);
            }
        }
    }

    [TestMethod]
    public void WriteData_persists_json_array_and_object_literals()
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
                        ["stepRunnerKey"] = "sys:fileOperation",
                        ["inputParams"] = new JObject
                        {
                            ["path"] = new JObject
                            {
                                ["value"] = new JArray { "C:\\a.txt", "C:\\b.txt" },
                            },
                            ["meta"] = new JObject
                            {
                                ["value"] = new JObject { ["recursive"] = true },
                            },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"path\": [");
            StringAssert.Contains(json, "\"C:\\\\a.txt\"");
            StringAssert.Contains(json, "\"meta\": {");
            StringAssert.Contains(json, "\"recursive\": true");

            var loaded = QuickerProjectFiles.ReadData(dir);
            var inputParams = loaded["steps"]![0]!["inputParams"] as JObject;
            var paths = inputParams!["path"]!["value"] as JArray;
            Assert.IsNotNull(paths);
            Assert.AreEqual(2, paths.Count);
            Assert.AreEqual("C:\\a.txt", paths[0]!.Value<string>());
            var meta = inputParams["meta"]!["value"] as JObject;
            Assert.IsNotNull(meta);
            Assert.AreEqual(true, meta["recursive"]!.Value<bool>());
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
