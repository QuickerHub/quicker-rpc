using System;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramStaticLintTests
{
    [TestMethod]
    public void Analyze_merges_structure_interpolation_and_file_issues()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = new JObject
            {
                ["variables"] = new JArray
                {
                    new JObject { ["key"] = "lineCount", ["type"] = "integer" },
                },
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:MsgBox",
                        ["inputParams"] = new JObject
                        {
                        ["message"] = new JObject { ["value"] = "Count: {lineCount}" },
                        },
                    },
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:delay",
                    },
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["file"] = "files/missing.cs" },
                        },
                    },
                },
            };

            var issues = ProgramStaticLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "MISSING_INTERPOLATION_PREFIX"));
            Assert.IsTrue(issues.Any(i => i.Code == "DUPLICATE_STEP_ID"));
            Assert.IsTrue(issues.Any(i => i.Code == "FILE_NOT_FOUND"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_missing_param_file_and_missing_variable_default_file()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = new JObject
            {
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "init",
                        ["type"] = "text",
                        ["defaultValue"] = new JObject { ["file"] = "files/default.txt" },
                    },
                },
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-cs",
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["file"] = "files/run.cs" },
                        },
                    },
                },
            };

            var issues = ProgramStaticLint.Analyze(root, data);

            var fileIssues = issues.Where(i => i.Code == "FILE_NOT_FOUND").ToList();
            Assert.AreEqual(2, fileIssues.Count);
            Assert.IsTrue(fileIssues.Any(i => i.Location.File == "files/run.cs"));
            Assert.IsTrue(fileIssues.Any(i => i.Location.File == "files/default.txt"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_skips_interpolation_when_no_variables_defined()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:MsgBox",
                        ["inputParams"] = new JObject
                        {
                            ["message"] = new JObject { ["value"] = "literal {brace}" },
                        },
                    },
                },
            };

            var issues = ProgramStaticLint.Analyze(root, data);

            Assert.IsFalse(issues.Any(i => i.Code == "MISSING_INTERPOLATION_PREFIX"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    private static string CreateProjectRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-static-lint-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "files"));
        return root;
    }

    private static void DeleteProjectRoot(string root)
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
