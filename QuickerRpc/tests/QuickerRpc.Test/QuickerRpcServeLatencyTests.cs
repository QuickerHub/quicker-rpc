using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Test;

/// <summary>
/// Live latency benchmark: pipe RPC vs qkrpc serve HTTP after connection is warm.
/// Run: <c>dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcServeLatencyTests</c>
/// Requires Quicker + plugin + <c>qkrpc serve</c> on :9477 (or QKRPC_HTTP_URL).
/// </summary>
[TestClass]
[TestCategory("Latency")]
public sealed class QuickerRpcServeLatencyTests
{
    public TestContext TestContext { get; set; } = null!;

    private static int WarmupIterations =>
        int.TryParse(Environment.GetEnvironmentVariable("QUICKER_RPC_LATENCY_WARMUP"), out var warmup) && warmup >= 0
            ? warmup
            : 3;

    private static int MeasurementIterations =>
        int.TryParse(Environment.GetEnvironmentVariable("QUICKER_RPC_LATENCY_ITERATIONS"), out var iterations) && iterations > 0
            ? iterations
            : 15;

    private static string ServeBaseUrl =>
        string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QKRPC_HTTP_URL"))
            ? "http://127.0.0.1:9477"
            : Environment.GetEnvironmentVariable("QKRPC_HTTP_URL")!.Trim().TrimEnd('/');

    private static bool AssertThresholds =>
        string.Equals(Environment.GetEnvironmentVariable("QUICKER_RPC_LATENCY_ASSERT"), "1", StringComparison.OrdinalIgnoreCase);

    [TestMethod]
    public async Task Serve_latency_benchmark_report()
    {
        await using var session = await QuickerRpcTestHelper.ConnectOrInconclusiveAsync(TestContext);
        using var serve = new QkrpcServeHttpClient(ServeBaseUrl, QuickerRpcTestSettings.ConnectTimeoutSeconds);
        var ct = QuickerRpcClient.CreateRpcCancellationToken(QuickerRpcTestSettings.ConnectTimeoutSeconds);

        if (!await serve.HealthOkAsync(ct).ConfigureAwait(false))
        {
            Assert.Inconclusive($"qkrpc serve unhealthy at {ServeBaseUrl}. Start serve or run build.ps1 -t.");
            return;
        }

        var actionId = await ResolveBenchmarkActionIdAsync(session, serve, ct).ConfigureAwait(false);
        var rows = new List<LatencyRow>();

        rows.Add(await MeasurePipeAsync(
            "ping",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc.PingAsync(ct).ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "ping (serve)",
            "ping",
            null,
            ct).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "guide.search (serve-local)",
            "guide.search",
            new { query = "step-runner search", limit = 8 },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "action.search",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .SearchActionSummariesAsync(
                        QuickerRpcTestSettings.SearchQuery,
                        maxResults: 10,
                        scope: null,
                        cancellationToken: ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "action.search (serve)",
            "action.search",
            new { query = QuickerRpcTestSettings.SearchQuery, limit = 10 },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "action.get summary",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .GetCompressedActionByIdAsync(actionId, "summary", ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "action.get summary (serve)",
            "action.get",
            new { id = actionId, returnMode = "summary" },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "action.get full",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .GetCompressedActionByIdAsync(actionId, "full", ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "action.get full (serve)",
            "action.get",
            new { id = actionId, returnMode = "full" },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "step-runner.search",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .SearchStepRunnersAsync("clipboard", maxResults: 10, cancellationToken: ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeColdWarmAsync(
            serve,
            "step-runner.search (serve)",
            "step-runner.search",
            new { query = "clipboard", limit = 10 },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "step-runner.get",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .GetStepRunnerDetailAsync(QuickerRpcTestSettings.StepRunnerKey, cancellationToken: ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeColdWarmAsync(
            serve,
            "step-runner.get (serve)",
            "step-runner.get",
            new { key = QuickerRpcTestSettings.StepRunnerKey },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "subprogram.search",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .SearchGlobalSubProgramsAsync("子程序", maxCount: 10, cancellationToken: ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "subprogram.search (serve)",
            "subprogram.search",
            new { query = "子程序", limit = 10 },
            ct).ConfigureAwait(false));

        rows.Add(await MeasurePipeAsync(
            "fa.search",
            WarmupIterations,
            MeasurementIterations,
            async () =>
            {
                var sw = Stopwatch.StartNew();
                _ = await session.Rpc
                    .SearchFontAwesomeIconsAsync("folder", maxResults: 10, cancellationToken: ct)
                    .ConfigureAwait(false);
                sw.Stop();
                return sw.Elapsed.TotalMilliseconds;
            }).ConfigureAwait(false));

        rows.Add(await MeasureServeAsync(
            serve,
            "fa.search (serve)",
            "fa.search",
            new { query = "folder", limit = 10 },
            ct).ConfigureAwait(false));

        PrintReport(rows);

        if (AssertThresholds)
        {
            AssertSoftThresholds(rows);
        }
        else
        {
            TestContext.WriteLine("Set QUICKER_RPC_LATENCY_ASSERT=1 to enforce soft p95 thresholds.");
        }
    }

    private static async Task<string> ResolveBenchmarkActionIdAsync(
        QuickerRpcClientSession session,
        QkrpcServeHttpClient serve,
        CancellationToken ct)
    {
        var configured = QuickerRpcTestSettings.TestActionId ?? QuickerRpcTestSettings.SharedActionId;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured!;
        }

        var (_, body) = await serve
            .InvokeAsync("action.search", new { query = QuickerRpcTestSettings.SearchQuery, limit = 1 }, ct)
            .ConfigureAwait(false);
        var fromServe = body.SelectToken("$.data.payload.items[0].actionId")?.Value<string>();
        if (!string.IsNullOrWhiteSpace(fromServe))
        {
            return fromServe!;
        }

        var search = await session.Rpc
            .SearchActionSummariesAsync(QuickerRpcTestSettings.SearchQuery, 1, null, sort: null, cancellationToken: ct)
            .ConfigureAwait(false);
        var fromPipe = search.Items?.FirstOrDefault()?.ActionId;
        Assert.IsFalse(string.IsNullOrWhiteSpace(fromPipe), "Need an action id for action.get benchmarks.");
        return fromPipe!;
    }

    private static async Task<LatencyRow> MeasurePipeAsync(
        string name,
        int warmup,
        int iterations,
        Func<Task<double>> measure)
    {
        for (var i = 0; i < warmup; i++)
        {
            _ = await measure().ConfigureAwait(false);
        }

        var samples = new List<double>(iterations);
        for (var i = 0; i < iterations; i++)
        {
            samples.Add(await measure().ConfigureAwait(false));
        }

        return BuildRow(name, "pipe", samples, warmup, iterations, null);
    }

    private static async Task<LatencyRow> MeasureServeAsync(
        QkrpcServeHttpClient serve,
        string name,
        string op,
        object? args,
        CancellationToken ct)
    {
        return await MeasureServeColdWarmAsync(serve, name, op, args, ct, includeCold: false).ConfigureAwait(false);
    }

    private static async Task<LatencyRow> MeasureServeColdWarmAsync(
        QkrpcServeHttpClient serve,
        string name,
        string op,
        object? args,
        CancellationToken ct,
        bool includeCold = true)
    {
        double? coldMs = null;
        if (includeCold)
        {
            var uniqueArgs = WithCacheBust(args);
            coldMs = (await serve.InvokeAsync(op, uniqueArgs, ct).ConfigureAwait(false)).ElapsedMs;
        }

        for (var i = 0; i < WarmupIterations; i++)
        {
            _ = await serve.InvokeAsync(op, args, ct).ConfigureAwait(false);
        }

        var samples = new List<double>(MeasurementIterations);
        for (var i = 0; i < MeasurementIterations; i++)
        {
            var (elapsedMs, _) = await serve.InvokeAsync(op, args, ct).ConfigureAwait(false);
            samples.Add(elapsedMs);
        }

        return BuildRow(name, "serve-http", samples, WarmupIterations, MeasurementIterations, coldMs);
    }

    private static object? WithCacheBust(object? args)
    {
        if (args is null)
        {
            return new { _cacheBust = Guid.NewGuid().ToString("N") };
        }

        var token = JObject.FromObject(args);
        token["_cacheBust"] = Guid.NewGuid().ToString("N");
        return token;
    }

    private static LatencyRow BuildRow(
        string name,
        string transport,
        IReadOnlyList<double> samples,
        int warmup,
        int iterations,
        double? coldMs)
    {
        var stats = LatencyBenchmarkStatistics.FromSamples(samples);
        return new LatencyRow
        {
            Name = name,
            Transport = transport,
            Warmup = warmup,
            Iterations = iterations,
            ColdMs = coldMs,
            Stats = stats,
        };
    }

    private void PrintReport(IReadOnlyList<LatencyRow> rows)
    {
        TestContext.WriteLine(string.Empty);
        TestContext.WriteLine("qkrpc latency benchmark (warm connection, ms)");
        TestContext.WriteLine($"serve={ServeBaseUrl} warmup={WarmupIterations} iterations={MeasurementIterations}");
        TestContext.WriteLine(string.Empty);
        TestContext.WriteLine("| operation | transport | cold | p50 | p95 | mean | min | max |");
        TestContext.WriteLine("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
        foreach (var row in rows)
        {
            TestContext.WriteLine(
                $"| {row.Name} | {row.Transport} | {FormatNullable(row.ColdMs)} | {row.Stats.MedianMs:F1} | {row.Stats.P95Ms:F1} | {row.Stats.MeanMs:F1} | {row.Stats.MinMs:F1} | {row.Stats.MaxMs:F1} |");
        }

        TestContext.WriteLine(string.Empty);
        TestContext.WriteLine("serve-http overhead vs pipe (p50 delta, same logical op):");
        foreach (var pair in PairComparable(rows))
        {
            var delta = pair.Serve.Stats.MedianMs - pair.Pipe.Stats.MedianMs;
            var ratio = pair.Pipe.Stats.MedianMs <= 0 ? 0 : pair.Serve.Stats.MedianMs / pair.Pipe.Stats.MedianMs;
            TestContext.WriteLine(
                $"  {pair.Label}: serve +{delta:F1} ms ({ratio:F2}x)");
        }
    }

    private static IEnumerable<(string Label, LatencyRow Pipe, LatencyRow Serve)> PairComparable(
        IReadOnlyList<LatencyRow> rows)
    {
        var pipeByKey = rows
            .Where(row => row.Transport == "pipe")
            .ToDictionary(row => NormalizePairKey(row.Name), row => row);
        foreach (var serveRow in rows.Where(row => row.Transport == "serve-http"))
        {
            var key = NormalizePairKey(serveRow.Name);
            if (pipeByKey.TryGetValue(key, out var pipeRow))
            {
                yield return (key, pipeRow, serveRow);
            }
        }
    }

    private static string NormalizePairKey(string name) =>
        name.Replace(" (serve)", string.Empty)
            .Replace(" (serve-local)", string.Empty)
            .Trim();

    private static string FormatNullable(double? value) => value.HasValue ? value.Value.ToString("F1") : "-";

    private static void AssertSoftThresholds(IReadOnlyList<LatencyRow> rows)
    {
        foreach (var row in rows)
        {
            var budget = ResolveP95BudgetMs(row.Name, row.Transport);
            Assert.IsTrue(
                row.Stats.P95Ms <= budget,
                $"{row.Name} p95 {row.Stats.P95Ms:F1}ms exceeds soft budget {budget}ms.");
        }
    }

    private static double ResolveP95BudgetMs(string name, string transport)
    {
        var key = name.ToLowerInvariant();
        if (key.Contains("guide.search", StringComparison.Ordinal))
        {
            return 30;
        }

        if (key.Contains("ping", StringComparison.Ordinal))
        {
            return transport == "pipe" ? 80 : 120;
        }

        if (key.Contains("fa.search", StringComparison.Ordinal))
        {
            return 250;
        }

        if (key.Contains("action.get full", StringComparison.Ordinal))
        {
            return 1200;
        }

        if (key.Contains("action.get", StringComparison.Ordinal))
        {
            return 600;
        }

        if (key.Contains("step-runner.get", StringComparison.Ordinal))
        {
            return 400;
        }

        if (key.Contains("search", StringComparison.Ordinal))
        {
            return 500;
        }

        return 800;
    }

    private sealed class LatencyRow
    {
        public string Name { get; init; } = string.Empty;

        public string Transport { get; init; } = string.Empty;

        public int Warmup { get; init; }

        public int Iterations { get; init; }

        public double? ColdMs { get; init; }

        public LatencyBenchmarkStatistics.Stats Stats { get; init; } = null!;
    }
}
