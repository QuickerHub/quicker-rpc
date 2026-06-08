using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// One focused test per diagnostics issue code. Serves as living documentation for the syntax linter.
/// </summary>
[TestClass]
public sealed class ProgramSyntaxLintRuleMatrixTests
{
    static ProgramSyntaxLintRuleMatrixTests()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveQuickerAssembly;
    }

    [TestMethod]
    public void Rule_MISSING_STEP_RUNNER()
    {
        var issues = ProgramStructureLint.Analyze(new JObject
        {
            ["steps"] = new JArray { new JObject { ["stepId"] = "s-1" } },
        });

        AssertIssue(issues, "MISSING_STEP_RUNNER", ProgramSyntaxIssueSeverity.Warning);
    }

    [TestMethod]
    public void Rule_DUPLICATE_STEP_ID()
    {
        var issues = ProgramStructureLint.Analyze(new JObject
        {
            ["steps"] = new JArray
            {
                new JObject { ["stepId"] = "dup", ["stepRunnerKey"] = "sys:delay" },
                new JObject { ["stepId"] = "dup", ["stepRunnerKey"] = "sys:delay" },
            },
        });

        AssertIssue(issues, "DUPLICATE_STEP_ID", ProgramSyntaxIssueSeverity.Error);
    }

    [TestMethod]
    public void Rule_MISSING_VARIABLE_KEY()
    {
        var issues = ProgramStructureLint.Analyze(new JObject
        {
            ["variables"] = new JArray { new JObject { ["type"] = "text" } },
        });

        AssertIssue(issues, "MISSING_VARIABLE_KEY", ProgramSyntaxIssueSeverity.Warning);
    }

    [TestMethod]
    public void Rule_DUPLICATE_VARIABLE_KEY()
    {
        var issues = ProgramStructureLint.Analyze(new JObject
        {
            ["variables"] = new JArray
            {
                new JObject { ["key"] = "x" },
                new JObject { ["key"] = "x" },
            },
        });

        AssertIssue(issues, "DUPLICATE_VARIABLE_KEY", ProgramSyntaxIssueSeverity.Error);
    }

    [TestMethod]
    public void Rule_MISSING_INTERPOLATION_PREFIX()
    {
        var data = new JObject
        {
            ["variables"] = new JArray { new JObject { ["key"] = "name" } },
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:MsgBox",
                    ["inputParams"] = new JObject
                    {
                        ["message"] = new JObject { ["value"] = "Hi {name}" },
                    },
                },
            },
        };

        var keys = InterpolationPrefixLint.CollectVariableKeys(data["variables"] as JArray);
        var issues = InterpolationPrefixLint.Analyze(data, keys);

        AssertIssue(issues, "MISSING_INTERPOLATION_PREFIX", ProgramSyntaxIssueSeverity.Warning);
    }

    [TestMethod]
    public void Rule_INVALID_BRANCH_FIELD()
    {
        var issues = ProgramBranchStructureLint.Analyze(new JObject
        {
            ["steps"] = new JArray
            {
                new JObject
                {
                    ["stepRunnerKey"] = "sys:evalexpression",
                    ["ifSteps"] = new JArray
                    {
                        new JObject { ["stepRunnerKey"] = "sys:delay" },
                    },
                },
            },
        });

        AssertIssue(issues, "INVALID_BRANCH_FIELD", ProgramSyntaxIssueSeverity.Warning);
    }

    [TestMethod]
    public void Rule_INPUT_SCRIPT_INVALID_LINE()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-rule-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
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
                            ["data"] = new JObject { ["value"] = "not-valid" },
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            AssertIssue(issues, "INPUT_SCRIPT_INVALID_LINE", ProgramSyntaxIssueSeverity.Error);
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
    public void Rule_INPUT_SCRIPT_INVALID_PARAM()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-rule-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
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
                            ["data"] = new JObject { ["value"] = "delay:not-a-number" },
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            AssertIssue(issues, "INPUT_SCRIPT_INVALID_PARAM", ProgramSyntaxIssueSeverity.Error);
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
    public void Rule_INPUT_SCRIPT_UNKNOWN_COMMAND()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-rule-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
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
                            ["data"] = new JObject { ["value"] = "unknowncmd:1" },
                        },
                    },
                },
            };

            var issues = InputScriptSyntaxLint.Analyze(root, data);
            AssertIssue(issues, "INPUT_SCRIPT_UNKNOWN_COMMAND", ProgramSyntaxIssueSeverity.Warning);
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
    public void Rule_FILE_NOT_FOUND()
    {
        var root = Path.Combine(Path.GetTempPath(), "qkrpc-rule-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var data = new JObject
            {
                ["steps"] = new JArray
                {
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

            AssertIssue(issues, "FILE_NOT_FOUND", ProgramSyntaxIssueSeverity.Error);
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
    public void Rule_LINT_TRUNCATED()
    {
        var issue = ProgramSyntaxIssueFactory.CreateTruncationWarning(totalChecks: 200, maxChecks: 120);

        Assert.AreEqual("LINT_TRUNCATED", issue.Code);
        Assert.AreEqual(ProgramSyntaxIssueSeverity.Warning, issue.Severity);
    }

    [TestMethod]
    public void Rule_EMPTY_CODE_expression()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckExpression("   ", variableTypes: null);

        Assert.IsFalse(result.Success);
        Assert.AreEqual("EMPTY_CODE", result.ErrorCode);
    }

    [TestMethod]
    public void Rule_EMPTY_CODE_csharp()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckCSharpScript("  ");

        Assert.IsFalse(result.Success);
        Assert.AreEqual("EMPTY_CODE", result.ErrorCode);
    }

    [TestMethod]
    public void Rule_COMPILE_ERROR_expression_undefined_variable()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckExpression(
            "$= {missing} + 1",
            new Dictionary<string, string> { ["known"] = "int" });

        Assert.IsFalse(result.Success, result.Message);
        Assert.AreEqual("COMPILE_ERROR", result.ErrorCode);
    }

    [TestMethod]
    public void Rule_COMPILE_ERROR_expression_invalid_syntax()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckExpression("$= 1 +", variableTypes: null);

        Assert.IsFalse(result.Success, result.Message);
        Assert.AreEqual("COMPILE_ERROR", result.ErrorCode);
    }

    [TestMethod]
    public void Rule_COMPILE_OK_expression_preserves_regex_unicode_escapes()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckExpression(
            "$= Regex.IsMatch({text}, @\"[\\p{L}\\p{N}_]+\")",
            new Dictionary<string, string> { ["text"] = "string" });

        Assert.IsTrue(result.Success, result.Message);
    }

    [TestMethod]
    public void Rule_COMPILE_ERROR_csharp_invalid_body()
    {
        var service = new CodeSyntaxCheckService();
        var result = service.CheckCSharpScript("public static void Exec() { var x = ; }");

        Assert.IsFalse(result.Success, result.Message);
        Assert.AreEqual("COMPILE_ERROR", result.ErrorCode);
    }

    [TestMethod]
    public void Rule_COMPILE_OK_csharp_method_body()
    {
        var service = new CodeSyntaxCheckService();
        QuickerRpcCodeSyntaxCheckResult result;
        try
        {
            result = service.CheckCSharpScript("return 1;");
        }
        catch (Exception ex)
        {
            Assert.Inconclusive("CSharp compile host unavailable in test AppDomain: " + ex.Message);
            return;
        }

        if (!result.Success
            && (result.Message?.Contains("CSharpScriptExecution is not available") == true
                || result.Message?.Contains("调用的目标发生了异常") == true))
        {
            Assert.Inconclusive(result.Message);
        }

        Assert.IsTrue(result.Success, result.Message);
    }

    private static void AssertIssue(
        IEnumerable<ProgramSyntaxIssue> issues,
        string code,
        ProgramSyntaxIssueSeverity severity)
    {
        var match = issues.FirstOrDefault(i => i.Code == code);
        Assert.IsNotNull(match, $"Expected issue code {code}");
        Assert.AreEqual(severity, match!.Severity);
    }

    private static Assembly? ResolveQuickerAssembly(object? sender, ResolveEventArgs args)
    {
        var assemblyName = new AssemblyName(args.Name).Name;
        if (string.IsNullOrEmpty(assemblyName))
        {
            return null;
        }

        var quickerDirectory = Path.GetDirectoryName(QuickerExeProbePaths.ResolveReleaseQuickerExe());
        if (string.IsNullOrEmpty(quickerDirectory))
        {
            return null;
        }

        var extension = string.Equals(assemblyName, "Quicker", StringComparison.OrdinalIgnoreCase)
            ? ".exe"
            : ".dll";
        var path = Path.Combine(quickerDirectory, assemblyName + extension);

        return File.Exists(path) ? Assembly.LoadFrom(path) : null;
    }
}
