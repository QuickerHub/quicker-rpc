using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.StepRunners;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class EvalExpressionStepRunnerTests
{
    static EvalExpressionStepRunnerTests()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveQuickerAssembly;
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_rewrites_placeholders_with_v_prefix()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "new[] {\"\\r\\n\",\"\\n\",\"\\r\"}.Contains({lineEnding}) + {realVariable}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            _ => true,
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("new[] {\"\\r\\n\",\"\\n\",\"\\r\"}.Contains(v_lineEnding) + v_realVariable", result);
        Assert.AreEqual(2, boundVariables.Count);
        Assert.AreEqual("lineEnding", boundVariables["v_lineEnding"]);
        Assert.AreEqual("realVariable", boundVariables["v_realVariable"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_rewrites_braces_inside_string_literals()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "\"{notVariable}\" + @\"{alsoNotVariable}\" + {realVariable}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            _ => true,
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("\"v_notVariable\" + @\"v_alsoNotVariable\" + v_realVariable", result);
        Assert.AreEqual(3, boundVariables.Count);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_deduplicates_repeated_placeholders()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "{definedVar} + {definedVar}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            _ => true,
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("v_definedVar + v_definedVar", result);
        Assert.AreEqual(1, boundVariables.Count);
        Assert.AreEqual("definedVar", boundVariables["v_definedVar"]);
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
