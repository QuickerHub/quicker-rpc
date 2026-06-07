using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class CodeSyntaxCheckServiceIntegrationTests
{
    static CodeSyntaxCheckServiceIntegrationTests()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveQuickerAssembly;
    }

    [TestMethod]
    public void NormalizeIntegerParseCalls_simplifies_parse_on_integer_variables()
    {
        var normalized = CodeSyntaxCheckService.NormalizeIntegerParseCalls(
            "int.Parse({fileCount}) > 0 && Int32.Parse({fileCount}) == 1",
            new Dictionary<string, string> { ["fileCount"] = "int" });

        Assert.AreEqual("{fileCount} > 0 && {fileCount} == 1", normalized);
    }

    [TestMethod]
    public void CheckExpression_accepts_int_Parse_on_integer_variable()
    {
        var service = new CodeSyntaxCheckService();
        var variableTypes = new Dictionary<string, string> { ["fileCount"] = "int" };
        var result = service.CheckExpression("$=int.Parse({fileCount}) > 0", variableTypes);

        Assert.IsTrue(result.Success, result.Message);
    }

    [TestMethod]
    public void CheckExpression_accepts_integer_comparison_without_parse()
    {
        var service = new CodeSyntaxCheckService();
        var variableTypes = new Dictionary<string, string> { ["fileCount"] = "int" };
        var result = service.CheckExpression("$={fileCount} > 0", variableTypes);

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
