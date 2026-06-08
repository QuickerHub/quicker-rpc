using System;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class InputScriptSyntaxLintTests
{
    [TestMethod]
    public void Analyze_accepts_typical_keyboard_paste_script()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep(
                "delay:100\n"
                + "paste:hello\n"
                + "hotkey:Ctrl+S\n"
                + "sendkeys:{LEFT 2}");
            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_skips_comment_and_blank_lines()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("// warmup\ndelay:50\n\ninput:ok");
            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_parses_inline_segments_separated_by_double_semicolon()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("delay:10;;input:hi");
            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_invalid_line_without_command_colon()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("delay:100\nnot-a-command");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_INVALID_LINE"));
            Assert.AreEqual(ProgramSyntaxCheckKind.InputScript, issues[0].Kind);
            Assert.AreEqual(2, issues.First(i => i.Code == "INPUT_SCRIPT_INVALID_LINE").Location.Line);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_warns_unknown_command()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("foo:bar");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_UNKNOWN_COMMAND"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_empty_required_param()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("delay:");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_EMPTY_PARAM"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_invalid_delay_param()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("delay:abc");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_INVALID_PARAM"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_invalid_mouse_button()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("click:foo");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_INVALID_PARAM"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_accepts_moveto_percent_coordinates()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("moveto:50%,50%");
            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_unmatched_keyup()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("keyup:F1");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_UNMATCHED_KEYUP"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_warns_unclosed_keydown_at_end()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("keydown:F1\ndelay:10");
            var issues = InputScriptSyntaxLint.Analyze(root, data);

            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_UNMATCHED_KEYDOWN"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_accepts_matched_keydown_keyup_pair()
    {
        var root = CreateProjectRoot();
        try
        {
            var data = BuildInputScriptStep("keydown:F1\ndelay:10\nkeyup:F1");
            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reports_missing_data_script()
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
                        ["stepRunnerKey"] = "sys:inputScript",
                        ["inputParams"] = new JObject(),
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_MISSING_DATA"));
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_skips_when_data_bound_via_var()
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
                        ["stepRunnerKey"] = "sys:inputScript",
                        ["inputParams"] = new JObject
                        {
                            ["data.var"] = "scriptText",
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_reads_script_from_data_file_ref()
    {
        var root = CreateProjectRoot();
        try
        {
            var scriptPath = Path.Combine(root, "files", "steps.txt");
            File.WriteAllText(scriptPath, "paste:hello");

            var data = new JObject
            {
                ["steps"] = new JArray
                {
                    new JObject
                    {
                        ["stepRunnerKey"] = "sys:inputScript",
                        ["inputParams"] = new JObject
                        {
                            ["data"] = new JObject { ["file"] = "files/steps.txt" },
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.AreEqual(0, issues.Count);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    [TestMethod]
    public void Analyze_walks_nested_if_steps()
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
                        ["stepRunnerKey"] = "sys:if",
                        ["ifSteps"] = new JArray
                        {
                            BuildInputScriptStepObject("bad-line"),
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            Assert.IsTrue(issues.Any(i => i.Code == "INPUT_SCRIPT_INVALID_LINE"));
            Assert.AreEqual("0/if/0", issues[0].Location.StepPath);
        }
        finally
        {
            DeleteProjectRoot(root);
        }
    }

    private static JObject BuildInputScriptStep(string script) =>
        new()
        {
            ["steps"] = new JArray { BuildInputScriptStepObject(script) },
        };

    private static JObject BuildInputScriptStepObject(string script) =>
        new()
        {
            ["stepRunnerKey"] = "sys:inputScript",
            ["inputParams"] = new JObject
            {
                ["data"] = new JObject { ["value"] = script },
            },
        };

    private static string CreateProjectRoot()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-input-script-" + Guid.NewGuid().ToString("N"));
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
