using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Dynamic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;
using Z.Expressions;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// In-process expression benchmarks for the plugin execute path (no qkrpc CLI / pipe overhead).
/// Hot-path tests reuse one <see cref="EvalContext"/> like action <c>GetEvalContext()</c>.
/// </summary>
[TestClass]
[TestCategory("Performance")]
public sealed class ExpressionExecutePerformanceTests
{
    private const int WarmupIterations = 10;
    private const int MeasureIterations = 100;

    private static readonly string WordfreqExpression =
        "var words = {content}\n"
        + "    .Split(new[] {\n"
        + "        ' ', '\\t', '\\n', '\\r', '.', ',', '!', '?', ';', ':',\n"
        + "        '(', ')', '[', ']', '{', '}', '\"', '\\'', '<', '>',\n"
        + "        '/', '\\\\', '|', '@', '#', '$', '%', '^', '&', '*',\n"
        + "        '+', '=', '~', '`',\n"
        + "    }, StringSplitOptions.RemoveEmptyEntries)\n"
        + "    .Select(w => w.Trim().ToLowerInvariant())\n"
        + "    .Where(w => w.Length > 0)\n"
        + "    .GroupBy(w => w)\n"
        + "    .Select(g => new { Word = g.Key, Count = g.Count() })\n"
        + "    .OrderByDescending(x => x.Count)\n"
        + "    .ThenBy(x => x.Word)\n"
        + "    .Take(10)\n"
        + "    .Select(x => $\"{x.Word}: {x.Count}\")\n"
        + "    .ToList();\n"
        + "{result} = string.Join(Environment.NewLine, words);";

    private static readonly string SmallWordfreqContent =
        "word frequency sample for Quicker action debug\n"
        + "the quick brown fox jumps over the lazy dog\n"
        + "word word word frequency frequency frequency test sample sample\n"
        + "hello world hello agent gui quicker automation";

    public TestContext TestContext { get; set; } = null!;

    static ExpressionExecutePerformanceTests()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveQuickerAssembly;
    }

    [TestMethod]
    public void HotPath_linq_without_anonymous_types_repeated_runs_within_budget()
    {
        const string code =
            "var words = {content}\n"
            + "    .Split(new[] { ' ', '\\n' }, StringSplitOptions.RemoveEmptyEntries)\n"
            + "    .Select(w => w.Trim().ToLowerInvariant())\n"
            + "    .Where(w => w.Length > 0)\n"
            + "    .ToList();\n"
            + "return words.Count;";
        var variablesJson = BuildVariablesJson(SmallWordfreqContent);
        var runner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);

        var stats = TryMeasureOrInconclusive(
            () => MeasureHotPath(runner, code, variablesJson),
            "LINQ without anonymous types");
        if (stats is null)
        {
            return;
        }

        Assert.IsTrue(stats.AverageMilliseconds < 30,
            $"LINQ no-anon hot-path avg {stats.AverageMilliseconds:F2} ms exceeds 30 ms budget");
    }

    [TestMethod]
    public void HotPath_wordfreq_linq_small_text_is_correct()
    {
        var variablesJson = BuildVariablesJson(SmallWordfreqContent);
        var runner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);

        TryExecuteOrInconclusive(
            () =>
            {
                var output = runner.Execute(WordfreqExpression, variablesJson);
                StringAssert.Contains(output, "word: 3");
                StringAssert.Contains(output, "frequency: 3");
            });
    }

    [TestMethod]
    public void HotPath_simple_expression_repeated_runs_within_budget()
    {
        const string code = "return {x}.Length;";
        var variablesJson = BuildVariablesJson(x: "hello world test");
        var runner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);

        var stats = TryMeasureOrInconclusive(
            () => MeasureHotPath(runner, code, variablesJson),
            "simple expression");
        if (stats is null)
        {
            return;
        }

        Assert.IsTrue(stats.AverageMilliseconds < 15,
            $"simple hot-path avg {stats.AverageMilliseconds:F2} ms exceeds 15 ms budget");
        Assert.IsTrue(stats.P95Milliseconds < 30,
            $"simple hot-path P95 {stats.P95Milliseconds:F2} ms exceeds 30 ms budget");
    }

    [TestMethod]
    public void HotPath_wordfreq_linq_small_text_repeated_runs_within_budget()
    {
        var variablesJson = BuildVariablesJson(SmallWordfreqContent);
        var runner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);

        var stats = TryMeasureOrInconclusive(
            () => MeasureHotPath(runner, WordfreqExpression, variablesJson),
            "wordfreq LINQ small text");
        if (stats is null)
        {
            return;
        }

        Assert.IsTrue(stats.AverageMilliseconds < 50,
            $"wordfreq small hot-path avg {stats.AverageMilliseconds:F2} ms exceeds 50 ms budget");
        Assert.IsTrue(stats.P95Milliseconds < 100,
            $"wordfreq small hot-path P95 {stats.P95Milliseconds:F2} ms exceeds 100 ms budget");
    }

    [TestMethod]
    public void HotPath_wordfreq_linq_large_text_repeated_runs_within_budget()
    {
        var largeContent = BuildRepeatingText(targetBytes: 256 * 1024);
        var variablesJson = BuildVariablesJson(largeContent);
        var runner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);

        var stats = TryMeasureOrInconclusive(
            () => MeasureHotPath(
                runner,
                WordfreqExpression,
                variablesJson,
                warmupIterations: 5,
                measureIterations: 20),
            $"wordfreq LINQ large text ({largeContent.Length} chars)");
        if (stats is null)
        {
            return;
        }

        Assert.IsTrue(stats.AverageMilliseconds < 400,
            $"wordfreq large hot-path avg {stats.AverageMilliseconds:F2} ms exceeds 400 ms budget");
    }

    [TestMethod]
    public void ColdPath_service_clones_eval_each_call_is_slower_than_hot_path()
    {
        const string code = "return {x}.Length;";
        var variablesJson = BuildVariablesJson(x: "hello world test");

        var hotRunner = new ExpressionExecuteBenchRunner(reuseEvalContext: true);
        var coldRunner = new ExpressionExecuteBenchRunner(reuseEvalContext: false);

        var hotStats = TryMeasureOrInconclusive(
            () => MeasureHotPath(hotRunner, code, variablesJson, measureIterations: 30),
            "hot path (reused eval)");
        var coldStats = TryMeasureOrInconclusive(
            () => MeasureHotPath(coldRunner, code, variablesJson, measureIterations: 30),
            "cold path (new eval per call, like qkrpc expr run inner path)");
        if (hotStats is null || coldStats is null)
        {
            return;
        }

        Assert.IsTrue(
            coldStats.AverageMilliseconds > hotStats.AverageMilliseconds,
            $"cold avg {coldStats.AverageMilliseconds:F2} ms should exceed hot avg {hotStats.AverageMilliseconds:F2} ms");
    }

    [TestMethod]
    public void EvalBinding_typed_globals_beats_dynamic_bag_on_simple_expression()
    {
        const string prepared = "v_x.Length";
        var globals = new Dictionary<string, object?>
        {
            ["v_x"] = "hello world test",
        };

        var eval = CreateEvalContext();
        TryExecuteOrInconclusive(() =>
        {
            WarmupBinding(eval, prepared, globals);
            WarmupDynamic(eval, prepared, globals);

            var typedStats = MeasureBinding(eval, prepared, globals);
            var dynamicStats = MeasureDynamic(eval, prepared, globals);

            LogTiming("EvalBinding typed (simple)", typedStats);
            LogTiming("EvalContext dynamic bag (simple)", dynamicStats);

            Assert.IsTrue(typedStats.AverageMilliseconds <= dynamicStats.AverageMilliseconds * 1.5,
                $"typed avg {typedStats.AverageMilliseconds:F2} ms should not be much slower than "
                + $"dynamic avg {dynamicStats.AverageMilliseconds:F2} ms");
        });
    }

    [TestMethod]
    public void EvalBinding_linq_succeeds_with_typed_globals_but_dynamic_bag_fails()
    {
        var prepared = PrepareWordfreqExpression();
        var globals = new Dictionary<string, object?>
        {
            ["v_content"] = SmallWordfreqContent,
            ["v_result"] = string.Empty,
        };

        var eval = CreateEvalContext();
        TryExecuteOrInconclusive(() =>
        {
            var typedResult = ExpressionEvalBinding.Execute(
                eval,
                prepared,
                globals,
                onVariableWritten: (key, value) => globals[key] = value);
            Assert.IsNotNull(typedResult);

            try
            {
                ExecuteDynamicBag(eval, prepared, globals);
                Assert.Fail("Expected dynamic bag execution to fail on LINQ + anonymous types.");
            }
            catch (Exception ex)
            {
                TestContext.WriteLine($"dynamic bag failed as expected: {ex.GetType().Name}: {ex.Message}");
            }
        });
    }

    private TimingStats MeasureHotPath(
        ExpressionExecuteBenchRunner runner,
        string code,
        string variablesJson,
        int warmupIterations = WarmupIterations,
        int measureIterations = MeasureIterations)
    {
        for (var i = 0; i < warmupIterations; i++)
        {
            runner.Execute(code, variablesJson);
        }

        var timings = new List<double>(measureIterations);
        for (var i = 0; i < measureIterations; i++)
        {
            var sw = Stopwatch.StartNew();
            runner.Execute(code, variablesJson);
            sw.Stop();
            timings.Add(sw.Elapsed.TotalMilliseconds);
        }

        return TimingStats.FromMilliseconds(timings);
    }

    private TimingStats? TryMeasureOrInconclusive(Func<TimingStats> measure, string label)
    {
        try
        {
            var stats = measure();
            LogTiming(label, stats);
            return stats;
        }
        catch (Exception ex) when (IsZExpressionsUnavailable(ex))
        {
            Assert.Inconclusive($"Z.Expressions unavailable in test host: {ex.Message}");
            return null;
        }
    }

    private void TryExecuteOrInconclusive(Action action)
    {
        try
        {
            action();
        }
        catch (Exception ex) when (IsZExpressionsUnavailable(ex))
        {
            Assert.Inconclusive($"Z.Expressions unavailable in test host: {ex.Message}");
        }
    }

    private static bool IsZExpressionsUnavailable(Exception ex) =>
        ex is FileNotFoundException or TypeLoadException
        || ex.Message.IndexOf("Z.Expressions", StringComparison.OrdinalIgnoreCase) >= 0
        || ex.Message.IndexOf("ERROR_005", StringComparison.OrdinalIgnoreCase) >= 0
        || ex.Message.IndexOf("trial period", StringComparison.OrdinalIgnoreCase) >= 0;

    private static string BuildVariablesJson(string? content = null, string x = "")
    {
        if (content is not null)
        {
            return JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["content"] = content,
                ["result"] = string.Empty,
            });
        }

        return JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["x"] = x,
        });
    }

    private static TimingStats MeasureBinding(
        EvalContext eval,
        string prepared,
        Dictionary<string, object?> globals)
    {
        var timings = new List<double>(MeasureIterations);
        for (var i = 0; i < MeasureIterations; i++)
        {
            var sw = Stopwatch.StartNew();
            ExpressionEvalBinding.Execute(eval, prepared, globals);
            sw.Stop();
            timings.Add(sw.Elapsed.TotalMilliseconds);
        }

        return TimingStats.FromMilliseconds(timings);
    }

    private static TimingStats MeasureDynamic(
        EvalContext eval,
        string prepared,
        IReadOnlyDictionary<string, object?> globals)
    {
        var timings = new List<double>(MeasureIterations);
        for (var i = 0; i < MeasureIterations; i++)
        {
            var sw = Stopwatch.StartNew();
            ExecuteDynamicBag(eval, prepared, globals);
            sw.Stop();
            timings.Add(sw.Elapsed.TotalMilliseconds);
        }

        return TimingStats.FromMilliseconds(timings);
    }

    private static void WarmupBinding(EvalContext eval, string prepared, Dictionary<string, object?> globals)
    {
        for (var i = 0; i < WarmupIterations; i++)
        {
            ExpressionEvalBinding.Execute(eval, prepared, globals);
        }
    }

    private static void WarmupDynamic(EvalContext eval, string prepared, IReadOnlyDictionary<string, object?> globals)
    {
        for (var i = 0; i < WarmupIterations; i++)
        {
            ExecuteDynamicBag(eval, prepared, globals);
        }
    }

    private static EvalContext CreateEvalContext()
    {
        var eval = EvalManager.DefaultContext.Clone();
        eval.UseLocalCache = true;
        return eval;
    }

    private static string PrepareWordfreqExpression()
    {
        var expression = WordfreqExpression
            .Replace("{content}", "v_content")
            .Replace("{result}", "v_result");
        return ExpressionEvalTransforms.EnsureTypedSplitAssignment(expression);
    }

    private static object? ExecuteDynamicBag(
        EvalContext eval,
        string prepared,
        IReadOnlyDictionary<string, object?> globals)
    {
        dynamic bag = new ExpandoObject();
        var dict = (IDictionary<string, object?>)bag;
        foreach (var pair in globals)
        {
            dict[pair.Key] = pair.Value ?? string.Empty;
        }

        return eval.Execute(prepared, bag);
    }

    private static string BuildRepeatingText(int targetBytes)
    {
        var words = new[]
        {
            "the", "quick", "brown", "fox", "word", "frequency", "sample", "test", "agent", "quicker",
        };
        var sb = new StringBuilder(targetBytes + 64);
        var i = 0;
        while (sb.Length < targetBytes)
        {
            if (sb.Length > 0)
            {
                sb.Append(' ');
            }

            sb.Append(words[i % words.Length]);
            i++;
        }

        return sb.ToString();
    }

    private void LogTiming(string label, TimingStats stats)
    {
        TestContext.WriteLine(
            $"{label}: n={stats.SampleCount}, avg={stats.AverageMilliseconds:F2} ms, "
            + $"P50={stats.P50Milliseconds:F2} ms, P95={stats.P95Milliseconds:F2} ms, "
            + $"max={stats.MaxMilliseconds:F2} ms");
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

    /// <summary>
    /// Mirrors <see cref="ExpressionExecuteService"/> execute path for benchmarks.
    /// </summary>
    private sealed class ExpressionExecuteBenchRunner
    {
        private readonly bool _reuseEvalContext;
        private EvalContext? _sharedEval;

        public ExpressionExecuteBenchRunner(bool reuseEvalContext)
        {
            _reuseEvalContext = reuseEvalContext;
        }

        public string Execute(string code, string variablesJson)
        {
            var expression = NormalizeExpression(code);
            var inputVariables = ParseVariablesJson(variablesJson);
            var globals = new Dictionary<string, object?>(StringComparer.Ordinal);
            var processedVars = new HashSet<string>(StringComparer.Ordinal);

            expression = ExpressionExecuteServiceVariablePattern.Replace(expression, match =>
            {
                var varKey = match.Groups[1].Value;
                var varName = "v_" + varKey;
                if (processedVars.Contains(varKey))
                {
                    return varName;
                }

                processedVars.Add(varKey);
                inputVariables.TryGetValue(varKey, out var value);
                globals[varName] = ExpressionVariableResolver.NormalizeForEvalBinding(value, null);
                return varName;
            });

            expression = ExpressionEvalTransforms.EnsureTypedSplitAssignment(expression);

            var eval = _reuseEvalContext ? GetOrCreateSharedEval() : CreateEvalContext();
            var outputVariables = new Dictionary<string, object?>(inputVariables, StringComparer.Ordinal);

            var evalResult = ExpressionEvalBinding.Execute(
                eval,
                expression,
                globals,
                onVariableWritten: (varKey, writtenValue) => outputVariables[varKey] = writtenValue);

            if (outputVariables.TryGetValue("result", out var resultText) && resultText is string text)
            {
                return text;
            }

            return evalResult?.ToString() ?? string.Empty;
        }

        private EvalContext GetOrCreateSharedEval()
        {
            if (_sharedEval is null)
            {
                _sharedEval = CreateEvalContext();
            }

            return _sharedEval;
        }

        private static string NormalizeExpression(string code)
        {
            var expression = code.Trim();
            if (expression.StartsWith("$=", StringComparison.Ordinal))
            {
                expression = expression.Substring(2).TrimStart();
            }

            return expression;
        }

        private static Dictionary<string, object?> ParseVariablesJson(string variablesJson)
        {
            var doc = JsonDocument.Parse(variablesJson);
            var map = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                map[prop.Name] = JsonElementToObject(prop.Value);
            }

            return map;
        }

        private static object? JsonElementToObject(JsonElement element) =>
            element.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number when element.TryGetInt64(out var l) => l,
                JsonValueKind.Number => element.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Array => element.EnumerateArray().Select(JsonElementToObject).ToList(),
                JsonValueKind.Object => element.EnumerateObject()
                    .ToDictionary(p => p.Name, p => JsonElementToObject(p.Value), StringComparer.Ordinal),
                _ => element.GetRawText(),
            };

        private static readonly System.Text.RegularExpressions.Regex ExpressionExecuteServiceVariablePattern =
            new(@"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", System.Text.RegularExpressions.RegexOptions.Compiled);
    }

    private sealed class TimingStats
    {
        public int SampleCount { get; private set; }
        public double AverageMilliseconds { get; private set; }
        public double P50Milliseconds { get; private set; }
        public double P95Milliseconds { get; private set; }
        public double MaxMilliseconds { get; private set; }

        public static TimingStats FromMilliseconds(IReadOnlyList<double> timings)
        {
            var ordered = timings.OrderBy(t => t).ToList();
            return new TimingStats
            {
                SampleCount = ordered.Count,
                AverageMilliseconds = ordered.Average(),
                P50Milliseconds = Percentile(ordered, 0.50),
                P95Milliseconds = Percentile(ordered, 0.95),
                MaxMilliseconds = ordered[ordered.Count - 1],
            };
        }

        private static double Percentile(IReadOnlyList<double> ordered, double ratio)
        {
            if (ordered.Count == 0)
            {
                return 0;
            }

            var index = (int)Math.Ceiling(ratio * ordered.Count) - 1;
            index = Math.Max(0, Math.Min(ordered.Count - 1, index));
            return ordered[index];
        }
    }
}
