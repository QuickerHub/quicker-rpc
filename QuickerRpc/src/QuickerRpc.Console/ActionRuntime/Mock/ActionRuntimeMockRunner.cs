using System.Diagnostics;
using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Integration;
using Quicker.ActionRuntime.Mocking;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal sealed class MockRunExecuteResult
{
    public bool Ok { get; init; }

    public string? ErrorCode { get; init; }

    public string? ErrorMessage { get; init; }

    public object? Payload { get; init; }

    public int ExitCode { get; init; }

    public IReadOnlyList<QuickerRpc.Contracts.Rpc.QuickerRpcActionTraceEvent>? Events { get; init; }
}

internal static class ActionRuntimeMockRunner
{
    internal static MockRunExecuteResult Execute(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        MockProfileDocument profile,
        string profileLabel,
        bool runAssertions)
    {
        if (!buildResult.Success || buildResult.Package is null)
        {
            return Error(
                buildResult.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                buildResult.ErrorMessage ?? "Build failed.");
        }

        var package = buildResult.Package;
        var runtime = ActionRuntimeExecutorFactory.CreateRuntime();
        var executor = new ActionRuntimeExecutor(runtime);
        var report = executor.AnalyzeSupport(package);

        if (!report.IsFullySupported && report.UnsupportedStepKeys.Count > 0)
        {
            return Error(
                "UNSUPPORTED_STEPS",
                $"Action uses steps not supported by ActionRuntime mock: {string.Join(", ", report.UnsupportedStepKeys)}");
        }

        package.InitialVars = MockProfileApplier.BuildInitialVars(profile)
            ?? package.InitialVars;

        var trace = new MockSyntheticTraceCollector();
        trace.Attach(package);

        var sw = Stopwatch.StartNew();
        RuntimeExecutionResult result;
        MockAssertionResult assertions;
        MockLedger mockLedger;

        using (var scope = DeterministicTestScope.Create(builder => MockProfileApplier.Apply(profile, builder)))
        {
            package.HostServices = scope.HostServices;
            result = executor.Execute(package);
            mockLedger = MockAssertionEvaluator.BuildLedger(scope);
            assertions = MockAssertionEvaluator.Evaluate(profile, result, scope, runAssertions);
        }

        sw.Stop();

        var payloadOk = result.IsSuccess && (!assertions.Ran || assertions.Passed);
        var payload = BuildPayload(
            buildResult,
            package,
            result,
            report,
            profileLabel,
            mockLedger,
            assertions,
            trace.Events,
            sw.ElapsedMilliseconds,
            payloadOk);

        var exitCode = payloadOk ? ExitCodes.Success : ExitCodes.Error;
        return new MockRunExecuteResult
        {
            Ok = payloadOk,
            Payload = payload,
            ExitCode = exitCode,
            Events = trace.Events,
        };
    }

    internal static object BuildProfilesListPayload()
    {
        var ids = MockProfileLoader.ListProfileIds();
        return new
        {
            ok = true,
            action = "mock-profiles-list",
            count = ids.Count,
            profilesDir = MockProfileLoader.ResolveProfilesDirectory(),
            profiles = ids,
        };
    }

    internal static object BuildPayload(
        ActionRuntimePackageBuilder.BuildResult buildResult,
        ActionExecutionPackage package,
        RuntimeExecutionResult result,
        PackageSupportReport report,
        string profileLabel,
        MockLedger mockLedger,
        MockAssertionResult assertions,
        IReadOnlyList<QuickerRpc.Contracts.Rpc.QuickerRpcActionTraceEvent> events,
        long durationMs,
        bool ok)
    {
        return new
        {
            ok,
            action = "mock-run",
            mode = "mock",
            mockProfile = profileLabel,
            actionId = package.ActionId,
            actionTitle = package.ActionTitle,
            projectDirectory = buildResult.ProjectDirectory,
            durationMs,
            executionId = result.ExecutionId,
            returnResult = result.ReturnResult,
            outputVars = result.OutputVars,
            errorMessage = result.ErrorMessage,
            stopFlag = result.StopFlag.ToString(),
            unsupportedStepKeys = report.UnsupportedStepKeys,
            eventCount = events.Count,
            events = events.Select(static e => new
            {
                e.Sequence,
                e.Kind,
                e.Depth,
                e.StepId,
                e.StepRunnerKey,
                e.StepRunnerName,
                e.Note,
                e.Message,
                e.ParamKey,
                e.ParamExpression,
                e.ParamValue,
                e.VarName,
                e.VarKey,
                e.ElapsedMs,
            }).ToList(),
            mockLedger,
            assertions = new
            {
                ran = assertions.Ran,
                passed = assertions.Passed,
                failures = assertions.Failures.Select(static f => new { f.Code, f.Message }),
            },
            fixHints = assertions.FixHints.Select(static h => new
            {
                h.Code,
                h.Message,
                h.Hint,
                h.DocRef,
            }),
            logs = result.Logs.Select(log => new
            {
                level = log.Level.ToString(),
                message = log.Message,
                timestamp = log.Timestamp,
            }).ToList(),
        };
    }


    private static MockRunExecuteResult Error(string code, string message) =>
        new()
        {
            Ok = false,
            ErrorCode = code,
            ErrorMessage = message,
            Payload = new { ok = false, action = "mock-run", mode = "mock", error = code, message },
            ExitCode = ExitCodes.Error,
        };
}
