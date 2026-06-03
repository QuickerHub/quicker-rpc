using System;
using System.IO;
using System.Linq;
using Google.Protobuf.WellKnownTypes;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.Proto.V1;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Offline round-trip tests for .quicker action project export (extract) and import (apply).
/// </summary>
[TestClass]
public sealed class ActionProjectRoundTripTests
{
    private static string CreateWorkspace()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-project-rt-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }

    private static string GetProjectDir(string workspaceRoot, string directoryName) =>
        QuickerProjectLayout.GetActionProjectDirectory(directoryName, workspaceRoot);

    private const string TestDirectoryName = "roundtrip-test";

    private static JObject SampleCsscriptStep(string stepId, string valueOrFileKey, bool isFile, string content)
    {
        var param = isFile
            ? new JObject { ["file"] = content }
            : new JObject { ["value"] = content };

        return new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepId"] = stepId,
                    ["stepRunnerKey"] = "sys:csscript",
                    ["inputParams"] = new JObject { ["code"] = param },
                },
            },
            ["variables"] = new JArray(),
        };
    }

    private static XActionFileRefExporter.ExportResult ExtractToProject(
        string workspaceRoot,
        string actionId,
        JObject latestData,
        long editVersion,
        JObject? templateData = null,
        int autoExternalizeMinLines = XActionFileRefExportOptions.DefaultAutoExternalizeMinLines)
    {
        var projectDir = GetProjectDir(workspaceRoot, TestDirectoryName);
        var options = new XActionFileRefExportOptions
        {
            AutoExternalizeMinLines = autoExternalizeMinLines,
        };
        var export = XActionFileRefExporter.Export(latestData, projectDir, templateData, options);
        Assert.IsTrue(export.Success, export.ErrorMessage);

        Directory.CreateDirectory(projectDir);
        QuickerProjectFiles.WriteData(projectDir, export.ExportedData!);
        QuickerProjectFiles.WriteActionInfo(
            projectDir,
            new ActionProjectInfo
            {
                Id = actionId,
                Title = "RoundTrip Test",
                EditVersion = editVersion,
                ExportedUtc = Timestamp.FromDateTime(DateTime.UtcNow),
            });

        Assert.IsTrue(File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)));
        Assert.IsTrue(File.Exists(QuickerProjectLayout.GetDataPath(projectDir)));
        return export;
    }

    private static JObject ApplyFromProject(
        string workspaceRoot,
        string actionId,
        bool expectValidateSuccess = true)
    {
        var projectDir = GetProjectDir(workspaceRoot, TestDirectoryName);
        var data = QuickerProjectFiles.ReadData(projectDir);
        var info = QuickerProjectFiles.ReadActionInfo(projectDir);

        Assert.AreEqual(actionId, info.Id);
        var validate = XActionFileRefValidator.Validate(data, projectDir);
        if (expectValidateSuccess)
        {
            Assert.IsTrue(validate.Success, validate.ErrorMessage);
        }
        else
        {
            Assert.IsFalse(validate.Success);
            return data;
        }

        var compile = XActionFileRefCompiler.Compile(data, projectDir);
        Assert.IsTrue(compile.Success, compile.ErrorMessage);
        return compile.CompiledData!;
    }

    private static string ReadCompiledCode(JObject compiled) =>
        compiled["steps"]![0]!["inputParams"]!["code"]!.Value<string>("value")!;

    [TestMethod]
    public void ExtractApply_roundtrip_keeps_short_inline_values()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var latest = SampleCsscriptStep("s-1", "code", isFile: false, "return 1;");
            ExtractToProject(workspace, actionId, latest, editVersion: 1);

            var projectDir = GetProjectDir(workspace, TestDirectoryName);
            var data = QuickerProjectFiles.ReadData(projectDir);
            var param = data["steps"]![0]!["inputParams"]!["code"] as JObject;
            Assert.AreEqual("return 1;", param!.Value<string>("value"));
            Assert.IsNull(param["file"]);

            var compiled = ApplyFromProject(workspace, actionId);
            Assert.AreEqual("return 1;", ReadCompiledCode(compiled));
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void ExtractApply_autoExternalize_then_edit_file_then_apply_compiles_new_body()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var longScript = string.Join("\n", Enumerable.Range(1, 12).Select(i => $"// line {i}"));
            var latest = SampleCsscriptStep("s-1", "code", isFile: false, longScript);
            var export = ExtractToProject(workspace, actionId, latest, editVersion: 2);
            Assert.AreEqual(1, export.WrittenFiles.Count);
            StringAssert.StartsWith(export.WrittenFiles[0], "files/csscript");

            var projectDir = GetProjectDir(workspace, TestDirectoryName);
            var data = QuickerProjectFiles.ReadData(projectDir);
            var fileRef = data["steps"]![0]!["inputParams"]!["code"]!.Value<string>("file");
            Assert.IsFalse(string.IsNullOrWhiteSpace(fileRef));

            var scriptPath = Path.Combine(projectDir, fileRef!.Replace('/', Path.DirectorySeparatorChar));
            File.WriteAllText(scriptPath, "return 99;", System.Text.Encoding.UTF8);

            var compiled = ApplyFromProject(workspace, actionId);
            Assert.AreEqual("return 99;", ReadCompiledCode(compiled));
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void ExtractApply_reexport_with_template_updates_file_content()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var first = SampleCsscriptStep("s-1", "code", isFile: false, "version A");
            ExtractToProject(workspace, actionId, first, editVersion: 1, autoExternalizeMinLines: 0);

            var projectDir = GetProjectDir(workspace, TestDirectoryName);
            var template = QuickerProjectFiles.ReadData(projectDir);
            var param = template["steps"]![0]!["inputParams"]!["code"] as JObject;
            param!.Remove("value");
            param["file"] = "files/manual.cs";
            Directory.CreateDirectory(Path.Combine(projectDir, "files"));
            File.WriteAllText(
                Path.Combine(projectDir, "files", "manual.cs"),
                "old",
                System.Text.Encoding.UTF8);
            QuickerProjectFiles.WriteData(projectDir, template);

            var latest = SampleCsscriptStep("s-1", "code", isFile: false, "version B");
            var second = XActionFileRefExporter.Export(latest, projectDir, template);
            Assert.IsTrue(second.Success, second.ErrorMessage);
            Assert.AreEqual(1, second.WrittenFiles.Count);

            var onDisk = File.ReadAllText(
                Path.Combine(projectDir, "files", "manual.cs"),
                System.Text.Encoding.UTF8);
            Assert.AreEqual("version B", onDisk);

            QuickerProjectFiles.WriteData(projectDir, second.ExportedData!);
            var compiled = ApplyFromProject(workspace, actionId);
            Assert.AreEqual("version B", ReadCompiledCode(compiled));
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void ExtractApply_validate_fails_when_referenced_file_missing()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
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
                            ["code"] = new JObject { ["file"] = "files/ghost.cs" },
                        },
                    },
                },
                ["variables"] = new JArray(),
            };

            ExtractToProject(workspace, actionId, latest, editVersion: 1, autoExternalizeMinLines: 0);

            var projectDir = GetProjectDir(workspace, TestDirectoryName);
            var data = QuickerProjectFiles.ReadData(projectDir);
            var validate = XActionFileRefValidator.Validate(data, projectDir);
            Assert.IsFalse(validate.Success);
            StringAssert.Contains(validate.ErrorMessage!, "not found");
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void ExtractApply_validate_fails_after_file_deleted_on_disk()
    {
        var workspace = CreateWorkspace();
        var actionId = Guid.NewGuid().ToString();
        try
        {
            var longScript = string.Join("\n", Enumerable.Range(1, 12).Select(i => $"line {i}"));
            ExtractToProject(
                workspace,
                actionId,
                SampleCsscriptStep("s-1", "code", isFile: false, longScript),
                editVersion: 3);

            var projectDir = GetProjectDir(workspace, TestDirectoryName);
            var data = QuickerProjectFiles.ReadData(projectDir);
            var fileRef = data["steps"]![0]!["inputParams"]!["code"]!.Value<string>("file");
            var scriptPath = Path.Combine(projectDir, fileRef!.Replace('/', Path.DirectorySeparatorChar));
            Assert.IsTrue(File.Exists(scriptPath));
            File.Delete(scriptPath);

            var validate = XActionFileRefValidator.Validate(data, projectDir);
            Assert.IsFalse(validate.Success);
        }
        finally
        {
            if (Directory.Exists(workspace))
            {
                Directory.Delete(workspace, recursive: true);
            }
        }
    }

    [TestMethod]
    public void Layout_relative_directory_uses_directory_name_not_guid()
    {
        var relative = QuickerProjectLayout.GetActionProjectRelativeDirectory("qkrpc-monitor");
        StringAssert.Contains(relative, "qkrpc-monitor");
        StringAssert.Contains(relative, ".quicker/actions");
    }
}
