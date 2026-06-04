using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class CodeSyntaxCheckServiceTests
{
    private static readonly CodeSyntaxCheckService Service = new();

    static CodeSyntaxCheckServiceTests()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveQuickerAssembly;
    }

    [TestMethod]
    public void CheckExpression_accepts_simple_literal()
    {
        var result = Service.CheckExpression("1 + 2");
        Assert.IsTrue(result.Success, result.Message);
    }

    [TestMethod]
    public void CheckExpression_rejects_invalid_syntax()
    {
        var result = Service.CheckExpression("1 + ");
        Assert.IsFalse(result.Success);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.Message));
    }

    [TestMethod]
    public void CheckExpression_strips_dollar_equals_prefix()
    {
        var result = Service.CheckExpression("$= {x} + 1", new Dictionary<string, string> { ["x"] = "int" });
        Assert.IsTrue(result.Success, result.Message);
    }

    [TestMethod]
    public void CheckCSharpScript_rejects_invalid_syntax()
    {
        var result = Service.CheckCSharpScript("public static void Exec() { +++ }");
        Assert.IsFalse(result.Success);
    }

    [TestMethod]
    public void CheckCSharpScript_accepts_minimal_exec()
    {
        var code = """
            using Quicker.Public;
            public static void Exec(IStepContext context) { }
            """;
        var result = Service.CheckCSharpScript(code);
        Assert.IsTrue(result.Success, result.Message);
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
