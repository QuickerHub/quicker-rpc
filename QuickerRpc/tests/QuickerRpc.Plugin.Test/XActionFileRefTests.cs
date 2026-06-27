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
                    ["stepRunnerKey"] = "sys:csscript",
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
    public void Export_preserves_file_refs_from_template_without_step_ids_by_node_path()
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
            Assert.AreEqual("updated body", result.ResourceFiles[0].Content);

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
    public void Export_migrates_template_defaultValueFile_and_writes_defaultValue_file_shape()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-export-var-" + Guid.NewGuid().ToString("N"));
        try
        {
            const string defaultBody = "line1\nline2\nline3";
            var latest = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "urls",
                        ["type"] = 0,
                        ["defaultValue"] = defaultBody,
                    },
                },
            };

            var template = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "urls",
                        ["type"] = 0,
                        ["defaultValueFile"] = "files/urls-default1.txt",
                    },
                },
            };

            var result = XActionFileRefExporter.Export(latest, root, template);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.IsTrue(
                result.Warnings.Any(w => w.Contains("defaultValueFile", StringComparison.Ordinal)),
                "expected compatibility warning");
            var variable = result.ExportedData!["variables"]![0] as JObject;
            Assert.AreEqual(
                "files/urls-default1.txt",
                (variable!["defaultValue"] as JObject)?.Value<string>("file"));
            Assert.IsNull(variable["defaultValueFile"]);
            Assert.AreEqual(1, result.ResourceFiles.Count);
            Assert.AreEqual(defaultBody, result.ResourceFiles[0].Content);
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
    public void Export_without_template_normalizes_legacy_defaultValueFile_on_output()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-export-legacy-" + Guid.NewGuid().ToString("N"));
        try
        {
            var latest = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "blob",
                        ["type"] = 0,
                        ["defaultValueFile"] = "files/blob-default1.txt",
                    },
                },
            };

            var result = XActionFileRefExporter.Export(latest, root, templateData: null);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            Assert.IsTrue(result.Warnings.Any(w => w.StartsWith("compatibility:", StringComparison.Ordinal)));

            var variable = result.ExportedData!["variables"]![0] as JObject;
            Assert.AreEqual(
                "files/blob-default1.txt",
                (variable!["defaultValue"] as JObject)?.Value<string>("file"));
            Assert.IsNull(variable["defaultValueFile"]);
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
    public void AutoExternalize_migrates_legacy_defaultValueFile_then_keeps_file_ref()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-var-legacy-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "files"));
            File.WriteAllText(
                Path.Combine(root, "files", "blob-default1.txt"),
                "existing",
                System.Text.Encoding.UTF8);

            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "blob",
                        ["type"] = 0,
                        ["defaultValueFile"] = "files/blob-default1.txt",
                    },
                },
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 100, minChars: 10_000);
            Assert.AreEqual(0, result.ResourceFiles.Count);

            var variable = data["variables"]![0] as JObject;
            Assert.AreEqual(
                "files/blob-default1.txt",
                (variable!["defaultValue"] as JObject)?.Value<string>("file"));
            Assert.IsNull(variable["defaultValueFile"]);
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
    public void AutoExternalize_jsscript_uses_js_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"console.log({i});"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:jsscript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".js");
            Assert.IsTrue(result.WrittenFiles[0].Contains("jsscript", StringComparison.OrdinalIgnoreCase));
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
    public void AutoExternalize_pythonscript_uses_py_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"x{i} = {i}"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:pythonscript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".py");
            Assert.IsTrue(result.WrittenFiles[0].Contains("pythonscript", StringComparison.OrdinalIgnoreCase));
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
    public void AutoExternalize_runscript_uses_ps1_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"Write-Host {i}"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:runScript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".ps1");
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
    public void AutoExternalize_webview2_url_uses_html_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join(
                "\n",
                Enumerable.Range(1, 6).Select(i => $"<div>{i}</div>"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:webview2",
                        ["inputParams"] = new JObject
                        {
                            ["url"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".html");
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
    public void AutoExternalize_webview2_script_uses_js_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join(
                "\n",
                Enumerable.Range(1, 6).Select(i => $"console.log({i});"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:webview2",
                        ["inputParams"] = new JObject
                        {
                            ["url"] = new JObject { ["value"] = "https://example.com" },
                            ["script"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".js");
            Assert.IsTrue(result.WrittenFiles[0].Contains("webview2", StringComparison.OrdinalIgnoreCase));
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
    public void AutoExternalize_runscript_bat_uses_bat_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"echo {i}"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:runScript",
                        ["inputParams"] = new JObject
                        {
                            ["type"] = new JObject { ["value"] = "BAT" },
                            ["script"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".bat");
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
    public void AutoExternalize_dboperation_sql_uses_sql_extension()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-auto-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join(
                "\n",
                Enumerable.Range(1, 6).Select(i => $"SELECT {i};"));
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:dboperation",
                        ["inputParams"] = new JObject
                        {
                            ["sql"] = new JObject { ["value"] = longValue },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.WrittenFiles.Count);
            StringAssert.EndsWith(result.WrittenFiles[0], ".sql");
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
    public void AutoExternalize_variable_long_default_by_line_count()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-var-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = string.Join("\n", Enumerable.Range(1, 6).Select(i => $"item {i}"));
            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "searchList",
                        ["type"] = 0,
                        ["defaultValue"] = longValue,
                    },
                },
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 4);
            Assert.AreEqual(1, result.ResourceFiles.Count);
            Assert.AreEqual("files/searchlist-default1.txt", result.ResourceFiles[0].RelativePath);

            var variable = data["variables"]![0] as JObject;
            Assert.AreEqual(
                "files/searchlist-default1.txt",
                (variable!["defaultValue"] as JObject)?.Value<string>("file"));
            Assert.IsNull(variable["defaultValueFile"]);
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
    public void AutoExternalize_variable_long_single_line_by_char_count()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-var-ext-" + Guid.NewGuid().ToString("N"));
        try
        {
            var longValue = new string('x', 300);
            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "urls",
                        ["type"] = 0,
                        ["defaultValue"] = longValue,
                    },
                },
            };

            var result = XActionFileRefAutoExternalizer.Apply(data, root, minLines: 100, minChars: 240);
            Assert.AreEqual(1, result.ResourceFiles.Count);
            var variable = data["variables"]![0] as JObject;
            Assert.IsNotNull((variable!["defaultValue"] as JObject)?["file"]);
            Assert.IsNull(variable["defaultValueFile"]);
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
    public void Compile_resolves_variable_defaultValue_file_object()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-var-file-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var defaultPath = Path.Combine(root, "files", "urls-default1.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(defaultPath)!);
            const string content = "line1\r\nline2";
            File.WriteAllText(defaultPath, content, System.Text.Encoding.UTF8);

            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "urls",
                        ["type"] = 0,
                        ["defaultValue"] = new JObject { ["file"] = "files/urls-default1.txt" },
                    },
                },
            };

            var result = XActionFileRefCompiler.Compile(data, root);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            var variable = result.CompiledData!["variables"]![0] as JObject;
            Assert.AreEqual(content, variable!.Value<string>("defaultValue"));
            Assert.IsFalse(variable["defaultValue"] is JObject);
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
    public void Compile_migrates_legacy_defaultValueFile()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-var-file-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var defaultPath = Path.Combine(root, "files", "urls-default1.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(defaultPath)!);
            const string content = "legacy";
            File.WriteAllText(defaultPath, content, System.Text.Encoding.UTF8);

            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "urls",
                        ["type"] = 0,
                        ["defaultValueFile"] = "files/urls-default1.txt",
                    },
                },
            };

            var result = XActionFileRefCompiler.Compile(data, root);
            Assert.IsTrue(result.Success, result.ErrorMessage);
            var variable = result.CompiledData!["variables"]![0] as JObject;
            Assert.AreEqual(content, variable!.Value<string>("defaultValue"));
            Assert.IsNull(variable["defaultValueFile"]);
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

    [TestMethod]
    public void EmbeddedSubProgram_export_compile_roundtrip()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-embedded-sub-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(root);
            var subPrograms = new JArray
            {
                new JObject
                {
                    ["id"] = "11111111-1111-1111-1111-111111111111",
                    ["name"] = "InnerSub",
                    ["description"] = "test",
                    ["icon"] = "",
                    ["steps"] = new JArray
                    {
                        new JObject
                        {
                            ["stepId"] = "s-sub-1",
                            ["stepRunnerKey"] = "sys:comment",
                            ["inputParams"] = new JObject
                            {
                                ["text"] = new JObject { ["value"] = "hello sub" },
                            },
                        },
                    },
                    ["variables"] = new JArray(),
                    ["subPrograms"] = new JArray(),
                },
            };

            var exportResult = ActionEmbeddedSubProgramExporter.Export(subPrograms, root);
            Assert.IsTrue(exportResult.Success, exportResult.ErrorMessage);
            Assert.AreEqual(1, exportResult.WrittenSubProgramDirectories.Count);

            var subRel = exportResult.WrittenSubProgramDirectories[0];
            var subKey = subRel.Split('/').Last();
            var subDir = QuickerProjectLayout.GetActionEmbeddedSubProgramDirectory(root, subKey);
            var infoPath = QuickerProjectLayout.GetInfoPath(subDir);
            var infoJson = File.ReadAllText(infoPath);
            StringAssert.Contains(infoJson, "\"kind\": \"embedded-subprogram\"");
            StringAssert.Contains(infoJson, "\"name\": \"InnerSub\"");
            StringAssert.Contains(infoJson, "\"id\": \"11111111-1111-1111-1111-111111111111\"");

            var rootData = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray(),
            };
            QuickerProjectFiles.WriteData(root, rootData);

            var compileResult = XActionFileRefCompiler.Compile(rootData, root);
            Assert.IsTrue(compileResult.Success, compileResult.ErrorMessage);
            var compiledSubs = compileResult.CompiledData!["subPrograms"] as JArray;
            Assert.IsNotNull(compiledSubs);
            Assert.AreEqual(1, compiledSubs!.Count);
            Assert.AreEqual("InnerSub", compiledSubs[0]!["name"]?.ToString());
            var subSteps = compiledSubs[0]!["steps"] as JArray;
            Assert.IsNotNull(subSteps);
            Assert.AreEqual(1, subSteps!.Count);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }
}
