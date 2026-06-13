using System;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.AgentModel.XAction.Compression;
using QuickerRpc.AgentModel.XAction.Proto;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class InputParamWireCoercerTests
{
    [TestMethod]
    public void ExpandInputParams_subprogramVarPrefix_roundTrips()
    {
        var inputParams = new JObject
        {
            ["var:value.var"] = "seed",
            ["var:result"] = "answer",
            ["var:path"] = "@var:workDir",
        };

        InputParamWireCoercer.ExpandInputParamsObject(inputParams);

        Assert.AreEqual("seed", inputParams["var:value"]!["varKey"]!.Value<string>());
        Assert.AreEqual("answer", inputParams["var:result"]!["value"]!.Value<string>());
        Assert.AreEqual("workDir", inputParams["var:path"]!["varKey"]!.Value<string>());

        InputParamWireCoercer.CompactInputParamsObject(inputParams);

        Assert.AreEqual("seed", inputParams["var:value.var"]!.Value<string>());
        Assert.AreEqual("answer", inputParams["var:result"]!.Value<string>());
        Assert.AreEqual("workDir", inputParams["var:path.var"]!.Value<string>());
    }

    [TestMethod]
    public void ParseNativeXActionJson_reads_escaped_var_subprogram_param_keys()
    {
        const string json = """
            {
              "Steps": [
                {
                  "StepRunnerKey": "sys:subprogram",
                  "InputParams": {
                    "var\u001fvalue": { "VarKey": "seed", "Value": "" },
                    "subProgram": { "Value": "Double" }
                  }
                }
              ],
              "Variables": []
            }
            """;

        var native = XActionDataJsonParser.ParseNativeXActionJson(json);

        Assert.IsTrue(native.Steps[0].InputParams.ContainsKey("var:value"));
        Assert.AreEqual("seed", native.Steps[0].InputParams["var:value"].VarKey);
        Assert.AreEqual("Double", native.Steps[0].InputParams["subProgram"].Value);
    }

    [TestMethod]
    public void ParseNativeXActionJson_reads_plain_input_param_value()
    {
        const string json = """
            {
              "Steps": [
                {
                  "StepRunnerKey": "sys:assign",
                  "InputParams": {
                    "input": { "Value": "hello" }
                  }
                }
              ],
              "Variables": []
            }
            """;

        var native = XActionDataJsonParser.ParseNativeXActionJson(json);

        Assert.AreEqual("hello", native.Steps[0].InputParams["input"].Value);
    }

    [TestMethod]
    public void ParseNativeXActionJson_reads_plain_input_param_var_key()
    {
        const string json = """
            {
              "Steps": [
                {
                  "StepRunnerKey": "sys:assign",
                  "InputParams": {
                    "input": { "VarKey": "seed" }
                  }
                }
              ],
              "Variables": []
            }
            """;

        var native = XActionDataJsonParser.ParseNativeXActionJson(json);

        Assert.AreEqual("seed", native.Steps[0].InputParams["input"].VarKey);
    }

    [TestMethod]
    public void ParseProgramBody_preserves_var_subprogram_input_param_keys()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = new JObject { ["value"] = "Double" },
                    ["var:value"] = new JObject { ["varKey"] = "seed" },
                },
            },
        };

        var native = XActionDataJsonParser.ParseProgramBody(steps, new JArray());

        Assert.IsTrue(native.Steps[0].InputParams.ContainsKey("var:value"), "ParseProgramBody should keep var:* input param keys");
        Assert.AreEqual("seed", native.Steps[0].InputParams["var:value"].VarKey);
    }

    [TestMethod]
    public void Compress_preserves_var_subprogram_wire_scalars()
    {
        var steps = new JArray
        {
            new JObject
            {
                ["stepRunnerKey"] = "sys:subprogram",
                ["inputParams"] = new JObject
                {
                    ["subProgram"] = "Double",
                    ["var:value.var"] = "seed",
                },
            },
        };

        InputParamWireCoercer.ExpandStepsRecursive(steps);
        var expanded = steps[0]!["inputParams"] as JObject;
        Assert.IsNotNull(expanded!["var:value"], "wire expand should produce var:value canonical key");
        Assert.AreEqual("seed", expanded["var:value"]!["varKey"]!.Value<string>());

        var catalog = new StepRunnerCatalog { Items = new System.Collections.Generic.List<StepRunnerDefinition>() };
        var compressed = XActionCompressor.Compress(steps, new JArray(), catalog, omitDefaultLiteralInputs: false);
        var step = (JObject)compressed["steps"]![0]!;
        var inputParams = step["inputParams"] as JObject;
        var keys = inputParams?.Properties().Select(p => p.Name).ToList() ?? new System.Collections.Generic.List<string>();
        var varValue = inputParams?["var:value"] as JObject;
        Assert.IsNotNull(varValue, $"var:value bind should survive wire scalar → compress; keys=[{string.Join(", ", keys)}]");
        Assert.AreEqual("seed", varValue!["varKey"]?.ToString());
    }

    [TestMethod]
    public void ExpandInputParams_keepsPascalCaseValue_withoutShadowing()
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
        InputParamWireCoercer.CompactInputParamsObject(inputParams);

        Assert.AreEqual(
            "%%eb7c36ee-5dde-4590-84a1-7e70ab7d0322",
            inputParams["subProgram"]!.Value<string>());
    }

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

    [TestMethod]
    public void WriteData_omits_ephemeral_ids_and_non_control_default_input_params()
    {
        var dir = Path.Combine(Path.GetTempPath(), "qkrpc-wire-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var catalog = new StepRunnerCatalog
            {
                Items = new System.Collections.Generic.List<StepRunnerDefinition>
                {
                    new()
                    {
                        Key = "sys:http",
                        InputParamDefs = new System.Collections.Generic.List<StepRunnerInputParamDef>
                        {
                            new() { Key = "method", DefaultValue = "GET", IsControlField = true },
                            new() { Key = "timeout", DefaultValue = "30" },
                            new() { Key = "enabled", VarType = StepRunnerAgentDefaultValue.BooleanVarType, DefaultValue = "1" },
                        },
                    },
                },
            };
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:http",
                        ["inputParams"] = new JObject
                        {
                            ["method"] = new JObject { ["value"] = "GET" },
                            ["timeout"] = new JObject { ["value"] = "30" },
                            ["enabled"] = new JObject { ["value"] = true },
                            ["url"] = new JObject { ["value"] = "https://example.com" },
                        },
                    },
                },
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["id"] = "v-1",
                        ["key"] = "result",
                    },
                },
            };

            QuickerProjectFiles.WriteData(dir, data, catalog);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            Assert.IsFalse(json.Contains("\"stepId\""), json);
            Assert.IsFalse(json.Contains("\"id\""), json);
            StringAssert.Contains(json, "\"method\": \"GET\"");
            Assert.IsFalse(json.Contains("\"timeout\""), json);
            Assert.IsFalse(json.Contains("\"enabled\""), json);
            StringAssert.Contains(json, "\"url\": \"https://example.com\"");
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
    public void WriteDataIfChanged_returns_false_for_already_normalized_data()
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
                        ["stepRunnerKey"] = "sys:comment",
                        ["inputParams"] = new JObject
                        {
                            ["text"] = new JObject { ["value"] = "hello" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);
            var changed = QuickerProjectFiles.WriteDataIfChanged(dir, QuickerProjectFiles.ReadData(dir));

            Assert.IsFalse(changed);
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
