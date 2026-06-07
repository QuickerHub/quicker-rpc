using System;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramSyntaxCollectorTests
{
    [TestMethod]
    public void Collect_finds_evalexpression_and_csscript()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-collect-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "files"));
        try
        {
            var scriptPath = Path.Combine(root, "files", "run.cs");
            File.WriteAllText(scriptPath, "using Quicker.Public; public static void Exec(IStepContext c) {}");

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
                            ["expression"] = new JObject { ["value"] = "$= 1 + 2" },
                        },
                    },
                    new JObject
                    {
                        ["stepId"] = "s-2",
                        ["stepRunnerKey"] = "sys:csscript",
                        ["inputParams"] = new JObject
                        {
                            ["script"] = new JObject { ["file"] = "files/run.cs" },
                        },
                    },
                },
                ["variables"] = new JArray
                {
                    new JObject
                    {
                        ["key"] = "n",
                        ["type"] = "integer",
                        ["defaultValue"] = "$= {n} * 2",
                    },
                },
            };

            var items = ProgramSyntaxCollector.Collect(root, data);
            Assert.AreEqual(3, items.Count);
            Assert.IsTrue(items.Any(i =>
                i.Kind == ProgramSyntaxCheckKind.Expression
                && i.StepRef == "s-1"
                && i.StepPath == "0"));
            Assert.IsTrue(items.Any(i =>
                i.Kind == ProgramSyntaxCheckKind.CSharp
                && i.File == "files/run.cs"
                && i.StepPath == "1"));
            Assert.IsTrue(items.Any(i => i.VariableKey == "n"));
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
    public void Collect_finds_dollar_eq_in_non_evalexpression_param()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-collect-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-msg",
                        ["stepRunnerKey"] = "sys:MsgBox",
                        ["inputParams"] = new JObject
                        {
                            ["message"] = new JObject { ["value"] = "$= 1 + 2" },
                        },
                    },
                },
            };

            var items = ProgramSyntaxCollector.Collect(root, data);
            Assert.AreEqual(1, items.Count);
            Assert.AreEqual(ProgramSyntaxCheckKind.Expression, items[0].Kind);
            Assert.AreEqual("message", items[0].ParamName);
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
    public void Collect_maps_varType_names_for_compile_check()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-collect-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepId"] = "s-1",
                        ["stepRunnerKey"] = "sys:MsgBox",
                        ["inputParams"] = new JObject
                        {
                            ["message"] = new JObject { ["value"] = "$= {known}" },
                        },
                    },
                },
                ["variables"] = new JArray
                {
                    new JObject { ["key"] = "known", ["varType"] = "integer" },
                    new JObject { ["key"] = "files", ["varType"] = "list" },
                },
            };

            var items = ProgramSyntaxCollector.Collect(root, data);
            Assert.AreEqual(1, items.Count);
            Assert.IsTrue(items[0].VariableTypes!.TryGetValue("known", out var intType));
            Assert.AreEqual("int", intType);
            Assert.IsTrue(items[0].VariableTypes.TryGetValue("files", out var listType));
            Assert.AreEqual("list", listType);
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
