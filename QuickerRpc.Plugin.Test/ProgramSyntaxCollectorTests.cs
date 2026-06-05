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
}
