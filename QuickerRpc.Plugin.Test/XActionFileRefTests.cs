using System;
using System.IO;
using System.Linq;
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
            Assert.AreEqual(1, result.ResourceFiles.Count);
            ActionProjectResourceFile.WriteAll(root, result.ResourceFiles);

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
    public void AutoExternalize_writes_long_values_to_files()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 12).Select(i => $"line {i}"));
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
                            ["code"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 10);
            Assert.AreEqual(1, result.ResourceFiles.Count);
            Assert.AreEqual("files/csscript1.cs", result.ResourceFiles[0].RelativePath);
            ActionProjectResourceFile.WriteAll(root, result.ResourceFiles);

            var param = data["steps"]![0]!["inputParams"]!["code"] as JObject;
            Assert.AreEqual("files/csscript1.cs", param!.Value<string>("file"));
            Assert.IsNull(param["value"]);

            var written = File.ReadAllText(
                Path.Combine(root, "files", "csscript1.cs"),
                System.Text.Encoding.UTF8);
            Assert.AreEqual(longValue, written);
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
    public void AutoExternalize_evalexpression_uses_eval_cs_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"var x{i} = {i};"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:evalexpression",
                        ["inputParams"] = new JObject
                        {
                            ["expression"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".eval.cs");
            Assert.IsTrue(result.WrittenFiles[0].Contains("evalexpression", StringComparison.OrdinalIgnoreCase));
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
    public void AutoExternalize_skips_short_values()
    {
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
                        ["code"] = new JObject { ["value"] = "short" },
                    },
                },
            },
            ["variables"] = new JArray(),
        };

        var result = XActionFileRefAutoExternalizer.Apply(data, Path.GetTempPath(), minLines: 10);
        Assert.AreEqual(0, result.WrittenFiles.Count);
        var param = data["steps"]![0]!["inputParams"]!["code"] as JObject;
        Assert.AreEqual("short", param!.Value<string>("value"));
    }

    [TestMethod]
    public void Validate_reports_missing_file_refs()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-file-ref-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
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
                            ["code"] = new JObject { ["file"] = "files/missing.cs" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefValidator.Validate(data, root);
            Assert.IsFalse(result.Success);
            Assert.AreEqual(1, result.FileRefs.Count);
            Assert.AreEqual("files/missing.cs", result.FileRefs[0].RelativePath);
            Assert.IsFalse(result.FileRefs[0].Exists);
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
    public void Validate_succeeds_when_file_refs_compile()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-file-ref-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var scriptPath = Path.Combine(root, "files", "main.cs");
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
                            ["code"] = new JObject { ["file"] = "files/main.cs" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefValidator.Validate(data, root);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.AreEqual(1, result.StepCount);
            Assert.AreEqual(1, result.FileRefs.Count);
            Assert.IsTrue(result.FileRefs[0].Exists);
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
