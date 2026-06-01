using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class XActionFileRefTests
{
    [TestMethod]
    public void Compile_resolves_file_to_value()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-file-ref-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var scriptPath = Path.Combine(root, "scripts", "main.cs");
            Directory.CreateDirectory(Path.GetDirectoryName(scriptPath)!);
            File.WriteAllText(scriptPath, "return 1;", System.Text.Encoding.UTF8);

            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["code"] = new JObject { ["file"] = "scripts/main.cs" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefCompiler.Compile(data, root);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            var param = result.CompiledData!["steps"]![0]!["inputParams"]!["code"] as JObject;
            Assert.AreEqual("return 1;", param!.Value<string>("value"));
            Assert.IsNull(param["file"]);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Compile_rejects_file_and_value_together()
    {
        var data = new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = "s-1",
                    ["inputParams"] = new JObject
                    {
                        ["code"] = new JObject { ["file"] = "a.txt", ["value"] = "x" },
                    },
                },
            },
            ["variables"] = new JArray(),
        };

        var result = XActionFileRefCompiler.Compile(data, Path.GetTempPath());
        Assert.IsFalse(result.Success);
        StringAssert.Contains(result.ErrorMessage!, "mutually exclusive");
    }

    [TestMethod]
    public void Export_preserves_file_refs_from_template()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-file-export-" + Guid.NewGuid().ToString("N"));
        try
        {
            var latest = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["code"] = new JObject { ["value"] = "updated body" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var template = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["code"] = new JObject { ["file"] = "scripts/main.cs" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefExporter.Export(latest, root, template);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.AreEqual(1, result.WrittenFiles.Count);

            var written = File.ReadAllText(
                Path.Combine(root, "scripts", "main.cs"),
                System.Text.Encoding.UTF8);
            Assert.AreEqual("updated body", written);

            var exportedParam = result.ExportedData!["steps"]![0]!["inputParams"]!["code"] as JObject;
            Assert.AreEqual("scripts/main.cs", exportedParam!.Value<string>("file"));
            Assert.IsNull(exportedParam["value"]);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Path_rejects_parent_segments()
    {
        Assert.ThrowsException<ArgumentException>(() =>
            XActionFileRefPath.NormalizeRelativePath("../escape.txt"));
    }
}
