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
    public void ReplaceVariablePlaceholders_ignores_csharp_array_initializer_literals()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression =
            "var lines = {clipText}.Split(new[] { \"\\r\\n\", \"\\r\", \"\\n\" }, StringSplitOptions.None)";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            DefinedKeys("clipText"),
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual(
            "var lines = v_clipText.Split(new[] { \"\\r\\n\", \"\\r\", \"\\n\" }, StringSplitOptions.None)",
            result);
        Assert.AreEqual(1, boundVariables.Count);
        Assert.AreEqual("clipText", boundVariables["v_clipText"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_rewrites_placeholders_with_v_prefix()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "new[] {\"\\r\\n\",\"\\n\",\"\\r\"}.Contains({lineEnding}) + {realVariable}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            DefinedKeys("lineEnding", "realVariable"),
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("new[] {\"\\r\\n\",\"\\n\",\"\\r\"}.Contains(v_lineEnding) + v_realVariable", result);
        Assert.AreEqual(2, boundVariables.Count);
        Assert.AreEqual("lineEnding", boundVariables["v_lineEnding"]);
        Assert.AreEqual("realVariable", boundVariables["v_realVariable"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_leaves_undefined_placeholders_inside_string_literals()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "\"{notVariable}\" + @\"{alsoNotVariable}\" + {realVariable}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            DefinedKeys("realVariable"),
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("\"{notVariable}\" + @\"{alsoNotVariable}\" + v_realVariable", result);
        Assert.AreEqual(1, boundVariables.Count);
        Assert.AreEqual("realVariable", boundVariables["v_realVariable"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_deduplicates_repeated_placeholders()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "{definedVar} + {definedVar}";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            DefinedKeys("definedVar"),
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("v_definedVar + v_definedVar", result);
        Assert.AreEqual(1, boundVariables.Count);
        Assert.AreEqual("definedVar", boundVariables["v_definedVar"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_preserves_regex_unicode_property_escapes()
    {
        var boundVariables = new Dictionary<string, object?>();
        var expression = "Regex.IsMatch({text}, @\"[\\p{L}\\p{N}_]+\")";

        var result = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            DefinedKeys("text"),
            key => key,
            (name, value) => boundVariables[name] = value);

        Assert.AreEqual("Regex.IsMatch(v_text, @\"[\\p{L}\\p{N}_]+\")", result);
        Assert.AreEqual(1, boundVariables.Count);
        Assert.AreEqual("text", boundVariables["v_text"]);
    }

    [TestMethod]
    public void ReplaceVariablePlaceholders_fastPath_matches_regexPath()
    {
        const string expression =
            "{a} + {b} + \"{c}\" + new[] {{ \"x\" }} + {a}";

        var boundFast = new Dictionary<string, object?>();
        var boundRegex = new Dictionary<string, object?>();
        var keys = DefinedKeys("a", "b", "c", "d", "e");

        var fast = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            keys,
            key => key,
            (name, value) => boundFast[name] = value);

        // Force regex path: many defined keys + sparse placeholders.
        var manyKeys = DefinedKeys();
        for (var i = 0; i < 100; i++)
        {
            manyKeys.Add("k" + i);
        }

        manyKeys.Add("a");
        manyKeys.Add("b");
        manyKeys.Add("c");

        var regex = EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            manyKeys,
            key => key,
            (name, value) => boundRegex[name] = value);

        Assert.AreEqual(fast, regex);
        CollectionAssert.AreEquivalent(boundFast.Keys, boundRegex.Keys);
    }

    private static HashSet<string> DefinedKeys(params string[] keys)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in keys)
        {
            set.Add(key);
        }

        return set;
    }

    private static HashSet<string> DefinedKeys()
    {
        return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
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
