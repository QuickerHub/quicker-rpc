using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;
namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class StepBranchWireCoercerTests
{
    [TestMethod]
    public void WriteData_omits_empty_branch_arrays_on_leaf_steps()
    {
        var dir = Path.Combine(Path.GetTempPath(), "qkrpc-branch-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:getClipboardText",
                        ["inputParams"] = new JObject
                        {
                            ["format"] = "UnicodeText",
                            ["waitMs"] = "800",
                            ["stopIfFail"] = "true",
                        },
                        ["outputParams"] = new JObject { ["output"] = "clipText" },
                        ["ifSteps"] = new JArray(),
                        ["elseSteps"] = new JArray(),
                        ["note"] = "读取剪贴板纯文本",
                        ["stepId"] = "read-clipboard-text",
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            Assert.IsFalse(json.Contains("ifSteps", StringComparison.Ordinal));
            Assert.IsFalse(json.Contains("elseSteps", StringComparison.Ordinal));
            StringAssert.Contains(json, "\"stepRunnerKey\": \"sys:getClipboardText\"");
            StringAssert.Contains(json, "\"output\": \"clipText\"");
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
    public void WriteData_keeps_nonempty_if_branch_and_omits_empty_else()
    {
        var dir = Path.Combine(Path.GetTempPath(), "qkrpc-branch-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:if",
                        ["inputParams"] = new JObject { ["condition.var"] = "flag" },
                        ["ifSteps"] = new JArray
                        {
                            new JObject
                            {
                                ["stepRunnerKey"] = "sys:delay",
                                ["inputParams"] = new JObject { ["ms"] = "100" },
                            },
                        },
                        ["elseSteps"] = new JArray(),
                    },
                },
                ["variables"] = new JArray(),
            };

            QuickerProjectFiles.WriteData(dir, data);

            var json = File.ReadAllText(QuickerProjectLayout.GetDataPath(dir));
            StringAssert.Contains(json, "\"ifSteps\"");
            Assert.IsFalse(json.Contains("elseSteps", StringComparison.Ordinal));
            StringAssert.Contains(json, "\"sys:delay\"");
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
