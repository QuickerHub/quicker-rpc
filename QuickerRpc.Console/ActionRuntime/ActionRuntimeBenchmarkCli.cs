using System.Text.Json;
using Quicker.ActionRuntime.Benchmarks;
using Quicker.ActionRuntime.Benchmarks.Models;

namespace QuickerRpc.Console.ActionRuntime;

internal static class ActionRuntimeBenchmarkCli
{
    internal static int Benchmark(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        bool json,
        int warmup,
        int iterations,
        bool forceGc)
    {
        if (!buildResult.Success || buildResult.Package?.Program is null)
        {
            return EmitError(
                json,
                buildResult.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.ErrorMessage ?? "Build failed.");
        }

        var package = buildResult.Package;
        var config = new BenchmarkConfig
        {
            WarmupIterations = warmup > 0 ? warmup : BenchmarkConfig.Quick.WarmupIterations,
            MeasurementIterations = iterations > 0 ? iterations : BenchmarkConfig.Quick.MeasurementIterations,
            ForceGcBetweenModes = forceGc,
        };

        var request = BenchmarkProgramLoader.FromProgram(
            package.ActionId ?? "custom",
            package.Program,
            package.ActionTitle);
        var report = new BenchmarkRunner().RunProgramReport(request, config);
        var scenario = report.Scenarios[0];

        if (json)
        {
            var payload = new
            {
                ok = scenario.EquivalenceVerified,
                action = "runtime-benchmark",
                standalone = true,
                actionId = package.ActionId,
                actionTitle = package.ActionTitle,
                stepCount = scenario.StepCount,
                equivalenceVerified = scenario.EquivalenceVerified,
                equivalenceNote = scenario.EquivalenceNote,
                compileMs = scenario.CompileMs,
                config = new
                {
                    config.WarmupIterations,
                    config.MeasurementIterations,
                    config.ForceGcBetweenModes,
                },
                jsonSteps = ToTimingDto(scenario.JsonSteps),
                compiledScript = ToTimingDto(scenario.CompiledScript),
                speedupRatio = scenario.SpeedupRatio,
                jsonOverheadPercent = scenario.JsonOverheadPercent,
            };
            global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            return scenario.EquivalenceVerified ? ExitCodes.Success : ExitCodes.Error;
        }

        global::System.Console.WriteLine(
            $"runtime-benchmark: {scenario.Name} ({scenario.StepCount} steps)");
        global::System.Console.WriteLine(
            $"  compile (separate): {scenario.CompileMs:F2} ms");
        global::System.Console.WriteLine(
            $"  JSON median:        {scenario.JsonSteps.Statistics.MedianMs:F3} ms");
        global::System.Console.WriteLine(
            $"  C# script median:   {scenario.CompiledScript.Statistics.MedianMs:F3} ms");
        global::System.Console.WriteLine(
            $"  speedup:            {scenario.SpeedupRatio:F2}x");
        if (!scenario.EquivalenceVerified)
        {
            global::System.Console.Error.WriteLine($"  equivalence failed: {scenario.EquivalenceNote}");
        }

        return scenario.EquivalenceVerified ? ExitCodes.Success : ExitCodes.Error;
    }

    private static object ToTimingDto(BenchmarkScenarioTiming timing) =>
        new
        {
            mode = timing.Mode.ToString(),
            medianMs = timing.Statistics.MedianMs,
            meanMs = timing.Statistics.MeanMs,
            minMs = timing.Statistics.MinMs,
            maxMs = timing.Statistics.MaxMs,
            p95Ms = timing.Statistics.P95Ms,
            samplesMs = timing.SamplesMs,
        };

    private static int EmitError(bool json, string code, string message)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = false, action = "runtime-benchmark", standalone = true, error = code, message },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.Error.WriteLine($"{code}: {message}");
        }

        return ExitCodes.Error;
    }
}
