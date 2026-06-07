using System;
using System.IO;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.AgentModel.XAction.Proto;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class VariableDefaultValueWireCoercerTests
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    [TestMethod]
    public void WriteData_persists_default_wire_and_ReadData_expands()
    {
        var dir = CreateTempProjectDir();
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray(),
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "inlineVar",
                        ["varType"] = "text",
                        ["defaultValue"] = "hello",
                    },
                    new JObject
                    {
                        ["key"] = "fileVar",
                        ["varType"] = "text",
                        ["defaultValue"] = new JObject { ["file"] = "files/body-default1.txt" },
                    },
                },
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"default\": \"hello\"");
            StringAssert.Contains(json, "\"default.file\": \"files/body-default1.txt\"");
            Assert.IsFalse(json.Contains("\"defaultValue\""));
            Assert.IsFalse(json.Contains("\"file\":"));

            var loaded = QuickerProjectFiles.ReadData(dir);
            var inlineVar = loaded["variables"]![0] as JObject;
            var fileVar = loaded["variables"]![1] as JObject;
            Assert.AreEqual("hello", inlineVar!["defaultValue"]!.Value<string>());
            Assert.AreEqual("files/body-default1.txt", fileVar!["defaultValue"]!["file"]!.Value<string>());
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void ReadData_expands_legacy_defaultValue_inline_on_disk()
    {
        var dir = CreateTempProjectDir();
        try
        {
            WriteLegacyDataJson(
                dir,
                """
                {
                  "steps": [],
                  "variables": [
                    { "key": "count", "varType": "text", "defaultValue": "42" }
                  ]
                }
                """);

            var loaded = QuickerProjectFiles.ReadData(dir);
            var variable = loaded["variables"]![0] as JObject;
            Assert.AreEqual("42", variable!["defaultValue"]!.Value<string>());
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void ReadData_expands_legacy_defaultValue_file_object_on_disk()
    {
        var dir = CreateTempProjectDir();
        try
        {
            WriteLegacyDataJson(
                dir,
                """
                {
                  "steps": [],
                  "variables": [
                    {
                      "key": "body",
                      "varType": "text",
                      "defaultValue": { "file": "files/body-default1.txt" }
                    }
                  ]
                }
                """);

            var loaded = QuickerProjectFiles.ReadData(dir);
            var variable = loaded["variables"]![0] as JObject;
            Assert.AreEqual("files/body-default1.txt", variable!["defaultValue"]!["file"]!.Value<string>());
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void ReadData_expands_legacy_defaultValueFile_on_disk()
    {
        var dir = CreateTempProjectDir();
        try
        {
            WriteLegacyDataJson(
                dir,
                """
                {
                  "steps": [],
                  "variables": [
                    {
                      "key": "urls",
                      "varType": "text",
                      "defaultValueFile": "files/urls-default1.txt"
                    }
                  ]
                }
                """);

            var loaded = QuickerProjectFiles.ReadData(dir);
            var variable = loaded["variables"]![0] as JObject;
            Assert.AreEqual("files/urls-default1.txt", variable!["defaultValue"]!["file"]!.Value<string>());
            Assert.IsNull(variable["defaultValueFile"]);
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void ReadData_expands_legacy_defaultValue_dot_file_wire_on_disk()
    {
        var dir = CreateTempProjectDir();
        try
        {
            WriteLegacyDataJson(
                dir,
                """
                {
                  "steps": [],
                  "variables": [
                    {
                      "key": "blob",
                      "varType": "text",
                      "defaultValue.file": "files/blob-default1.txt"
                    }
                  ]
                }
                """);

            var loaded = QuickerProjectFiles.ReadData(dir);
            var variable = loaded["variables"]![0] as JObject;
            Assert.AreEqual("files/blob-default1.txt", variable!["defaultValue"]!["file"]!.Value<string>());
            Assert.IsNull(variable["defaultValue.file"]);
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void WriteData_migrates_legacy_disk_json_to_default_wire()
    {
        var dir = CreateTempProjectDir();
        try
        {
            WriteLegacyDataJson(
                dir,
                """
                {
                  "steps": [],
                  "variables": [
                    { "key": "inlineVar", "defaultValue": "hello" },
                    { "key": "fileVar", "defaultValue": { "file": "files/body-default1.txt" } },
                    { "key": "legacyFileVar", "defaultValueFile": "files/legacy-default1.txt" }
                  ]
                }
                """);

            var expanded = QuickerProjectFiles.ReadData(dir);
            QuickerProjectFiles.WriteData(dir, expanded);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"default\": \"hello\"");
            StringAssert.Contains(json, "\"default.file\": \"files/body-default1.txt\"");
            StringAssert.Contains(json, "\"default.file\": \"files/legacy-default1.txt\"");
            Assert.IsFalse(json.Contains("\"defaultValue\""));
            Assert.IsFalse(json.Contains("\"defaultValueFile\""));
        }
        finally
        {
            DeleteTempDir(dir);
        }
    }

    [TestMethod]
    public void ExpandVariableObject_reads_default_wire_and_legacy_aliases()
    {
        var wireFile = new JObject
        {
            ["key"] = "a",
            ["default.file"] = "files/a.txt",
        };
        VariableDefaultValueWireCoercer.ExpandVariableObject(wireFile);
        Assert.AreEqual("files/a.txt", wireFile["defaultValue"]!["file"]!.Value<string>());
        Assert.IsNull(wireFile["default.file"]);

        var legacyWireFile = new JObject
        {
            ["key"] = "a2",
            ["defaultValue.file"] = "files/a2.txt",
        };
        VariableDefaultValueWireCoercer.ExpandVariableObject(legacyWireFile);
        Assert.AreEqual("files/a2.txt", legacyWireFile["defaultValue"]!["file"]!.Value<string>());
        Assert.IsNull(legacyWireFile["defaultValue.file"]);

        var legacyInline = new JObject
        {
            ["key"] = "c",
            ["defaultValue"] = "42",
        };
        VariableDefaultValueWireCoercer.ExpandVariableObject(legacyInline);
        Assert.AreEqual("42", legacyInline["defaultValue"]!.Value<string>());

        var inline = new JObject
        {
            ["key"] = "d",
            ["default"] = "99",
        };
        VariableDefaultValueWireCoercer.ExpandVariableObject(inline);
        Assert.AreEqual("99", inline["defaultValue"]!.Value<string>());
        Assert.IsNull(inline["default"]);
    }

    [TestMethod]
    public void NormalizePatch_expands_legacy_defaultValue_shapes()
    {
        var patch = new JObject
        {
            ["variables"] = new JArray
            {
                new JObject
                {
                    ["key"] = "count",
                    ["defaultValue"] = "7",
                },
                new JObject
                {
                    ["key"] = "urls",
                    ["defaultValue.file"] = "files/urls-default1.txt",
                },
                new JObject
                {
                    ["key"] = "body",
                    ["defaultValue"] = new JObject { ["file"] = "files/body-default1.txt" },
                },
            },
        };

        InputParamWireCoercer.NormalizePatch(patch);

        var variables = patch["variables"] as JArray;
        Assert.AreEqual("7", variables![0]!["defaultValue"]!.Value<string>());
        Assert.AreEqual("files/urls-default1.txt", variables[1]!["defaultValue"]!["file"]!.Value<string>());
        Assert.AreEqual("files/body-default1.txt", variables[2]!["defaultValue"]!["file"]!.Value<string>());
    }

    private static string CreateTempProjectDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), "qkrpc-var-wire-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static void WriteLegacyDataJson(string projectDirectory, string json)
    {
        Directory.CreateDirectory(projectDirectory);
        File.WriteAllText(QuickerProjectLayout.GetDataPath(projectDirectory), json, Utf8NoBom);
    }

    private static void DeleteTempDir(string dir)
    {
        if (Directory.Exists(dir))
        {
            Directory.Delete(dir, true);
        }
    }
}
