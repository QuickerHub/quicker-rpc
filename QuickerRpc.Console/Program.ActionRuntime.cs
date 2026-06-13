using QuickerRpc.Console.ActionRuntime;
using QuickerRpc.Console.ActionRuntime.Mock;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunActionRuntimeCompileAsync(ActionOptions options)
    {
        if (options.Debug || options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "STANDALONE_MODE_CONFLICT",
                "--debug/--trace are not supported for runtime-compile.")
                .ConfigureAwait(false);
        }

        var buildResult = await BuildActionRuntimePackageAsync(options).ConfigureAwait(false);
        return ActionRuntimeCompileCli.Compile(
            buildResult,
            options.Json,
            options.Out,
            options.ScriptOut);
    }

    private static async Task<int> RunActionRuntimeBenchmarkAsync(ActionOptions options)
    {
        if (options.Debug || options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "STANDALONE_MODE_CONFLICT",
                "--debug/--trace are not supported for runtime-benchmark.")
                .ConfigureAwait(false);
        }

        var buildResult = await BuildActionRuntimePackageAsync(options).ConfigureAwait(false);
        return ActionRuntimeBenchmarkCli.Benchmark(
            buildResult,
            options.Json,
            options.BenchmarkWarmup,
            options.BenchmarkIterations,
            options.BenchmarkForceGc);
    }

    private static async Task<int> RunActionRuntimeCheckAsync(ActionOptions options)
    {
        if (options.Debug || options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "STANDALONE_MODE_CONFLICT",
                "--debug/--trace require Quicker; omit them for standalone runtime.")
                .ConfigureAwait(false);
        }

        var buildResult = await BuildActionRuntimePackageAsync(options).ConfigureAwait(false);
        var exitCode = ActionRuntimeCli.Run(
            buildResult,
            options.Json,
            debug: false,
            options.VerboseHost,
            checkOnly: true);
        return exitCode;
    }

    private static Task<int> RunActionRuntimeKeysAsync(ActionOptions options)
    {
        var exitCode = ActionRuntimeCli.Keys(options.Json);
        return Task.FromResult(exitCode);
    }

    private static async Task<int> RunActionMockAsync(ActionOptions options)
    {
        if (options.Debug || options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "MOCK_MODE_CONFLICT",
                "--mock cannot be combined with --debug or --trace.")
                .ConfigureAwait(false);
        }

        MockProfileDocument profile;
        string profileLabel;
        try
        {
            profile = MockProfileLoader.Load(options.MockProfile, options.MockProfileFile);
            profileLabel = !string.IsNullOrWhiteSpace(options.MockProfile)
                ? options.MockProfile!.Trim()
                : Path.GetFileNameWithoutExtension(options.MockProfileFile ?? "custom");
        }
        catch (Exception ex) when (ex is FileNotFoundException or InvalidOperationException)
        {
            return await EmitErrorAndFailAsync(options.Json, "MOCK_PROFILE_NOT_FOUND", ex.Message)
                .ConfigureAwait(false);
        }

        var buildResult = await BuildActionRuntimePackageAsync(options).ConfigureAwait(false);
        return ActionRuntimeMockCli.Run(
            buildResult,
            profile,
            profileLabel,
            options.Json,
            options.Assert || profile.Assertions != null);
    }

    private static async Task<int> RunActionMockProfilesAsync(ActionOptions options)
    {
        if (!string.Equals(options.SubCommand, "list", StringComparison.OrdinalIgnoreCase))
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "UNKNOWN_MOCK_PROFILES_COMMAND",
                "Use: qkrpc action mock-profiles list [--json]")
                .ConfigureAwait(false);
        }

        return ActionRuntimeMockCli.ListProfiles(options.Json);
    }

    private static async Task<int> RunActionMockTraceDiffAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "MISSING_ACTION_ID",
                "Provide --id <actionId> for mock-trace-diff.")
                .ConfigureAwait(false);
        }

        MockProfileDocument profile;
        string profileLabel;
        try
        {
            profile = MockProfileLoader.Load(options.MockProfile, options.MockProfileFile);
            profileLabel = !string.IsNullOrWhiteSpace(options.MockProfile)
                ? options.MockProfile!.Trim()
                : Path.GetFileNameWithoutExtension(options.MockProfileFile ?? "custom");
        }
        catch (Exception ex) when (ex is FileNotFoundException or InvalidOperationException)
        {
            return await EmitErrorAndFailAsync(options.Json, "MOCK_PROFILE_NOT_FOUND", ex.Message)
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);

            var buildResult = await ActionRuntimeQuickerLoader.BuildFromActionIdAsync(
                    session.Proxy,
                    actionId,
                    options.Param,
                    rpcToken)
                .ConfigureAwait(false);
            if (!buildResult.Success || buildResult.Package is null)
            {
                return await EmitErrorAndFailAsync(
                    options.Json,
                    buildResult.ErrorCode ?? "RUNTIME_PACKAGE_BUILD_FAILED",
                    buildResult.ErrorMessage ?? "Build failed.")
                    .ConfigureAwait(false);
            }

            var mockOutcome = ActionRuntimeMockRunner.Execute(
                buildResult,
                profile,
                profileLabel,
                runAssertions: false);
            if (!string.IsNullOrWhiteSpace(mockOutcome.ErrorCode)
                && !string.Equals(mockOutcome.ErrorCode, "MOCK_RUN_FAILED", StringComparison.Ordinal))
            {
                return await EmitErrorAndFailAsync(
                    options.Json,
                    mockOutcome.ErrorCode,
                    mockOutcome.ErrorMessage ?? "Mock run failed.")
                    .ConfigureAwait(false);
            }

            var mockEvents = mockOutcome.Events ?? [];
            var pluginTrace = await session.Proxy
                .RunActionTraceAsync(actionId, options.Param, progress: null, rpcToken)
                .ConfigureAwait(false);

            var diff = MockTraceDiffComparer.Compare(mockEvents, pluginTrace.Events);
            var payloadOk = diff.StepRunnerSpineMatch;
            var payload = new
            {
                ok = payloadOk,
                action = "mock-trace-diff",
                mockProfile = profileLabel,
                actionId = pluginTrace.ActionId ?? actionId,
                actionTitle = pluginTrace.ActionTitle ?? buildResult.Package.ActionTitle,
                mock = new
                {
                    ok = mockOutcome.Ok,
                    eventCount = mockEvents.Count,
                    stepRunnerSpine = diff.MockStepRunnerSpine,
                },
                plugin = new
                {
                    ok = pluginTrace.Ok,
                    eventCount = pluginTrace.EventCount,
                    stepRunnerSpine = diff.PluginStepRunnerSpine,
                },
                diff = new
                {
                    stepRunnerSpineMatch = diff.StepRunnerSpineMatch,
                    firstMismatchIndex = diff.FirstMismatchIndex,
                    mockOnlyStepRunnerKeys = diff.MockOnlyStepRunnerKeys,
                    pluginOnlyStepRunnerKeys = diff.PluginOnlyStepRunnerKeys,
                },
            };

            if (options.Json)
            {
                global::System.Console.WriteLine(
                    System.Text.Json.JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }
            else if (payloadOk)
            {
                global::System.Console.WriteLine(
                    $"mock-trace-diff ok ({profileLabel}): {diff.MockStepRunnerSpine.Count} steps match plugin spine");
            }
            else
            {
                global::System.Console.Error.WriteLine(
                    $"mock-trace-diff mismatch at index {diff.FirstMismatchIndex?.ToString() ?? "?"}");
                if (diff.MockOnlyStepRunnerKeys.Count > 0)
                {
                    global::System.Console.Error.WriteLine(
                        $"  mock-only: {string.Join(", ", diff.MockOnlyStepRunnerKeys)}");
                }

                if (diff.PluginOnlyStepRunnerKeys.Count > 0)
                {
                    global::System.Console.Error.WriteLine(
                        $"  plugin-only: {string.Join(", ", diff.PluginOnlyStepRunnerKeys)}");
                }
            }

            return payloadOk ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                ex.ErrorCode ?? "RPC_CONNECT_FAILED",
                ex.Message)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "RPC_TIMEOUT",
                $"RPC timed out after {options.TimeoutSeconds}s.")
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "MOCK_TRACE_DIFF_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionStandaloneAsync(ActionOptions options)
    {
        if (options.Debug && options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "CONFLICTING_RUN_MODE",
                "Use either --trace (Quicker plugin) or --standalone (ActionRuntime), not both.")
                .ConfigureAwait(false);
        }

        if (options.Trace)
        {
            return await EmitErrorAndFailAsync(
                options.Json,
                "STANDALONE_MODE_CONFLICT",
                "--trace requires Quicker plugin; use --standalone without --trace.")
                .ConfigureAwait(false);
        }

        var buildResult = await BuildActionRuntimePackageAsync(options).ConfigureAwait(false);
        var exitCode = ActionRuntimeCli.Run(
            buildResult,
            options.Json,
            options.Debug,
            options.VerboseHost,
            checkOnly: false);
        return exitCode;
    }

    private static async Task<ActionRuntimePackageBuilder.BuildResult> BuildActionRuntimePackageAsync(
        ActionOptions options)
    {
        var buildResult = ActionRuntimePackageBuilder.Build(
            options.PackageFile,
            options.Dir,
            options.Id ?? options.Code,
            options.XAction,
            options.XActionFile,
            options.Param);

        if (ShouldFetchActionFromQuicker(options, buildResult))
        {
            buildResult = await TryBuildActionRuntimeFromQuickerAsync(options).ConfigureAwait(false);
        }

        return buildResult;
    }

    private static bool ShouldFetchActionFromQuicker(
        ActionOptions options,
        ActionRuntimePackageBuilder.BuildResult buildResult) =>
        buildResult.ErrorCode == "PROJECT_NOT_FOUND"
        && string.IsNullOrWhiteSpace(options.Dir)
        && !string.IsNullOrWhiteSpace(options.Id ?? options.Code)
        && string.IsNullOrWhiteSpace(options.PackageFile)
        && string.IsNullOrWhiteSpace(options.XAction)
        && string.IsNullOrWhiteSpace(options.XActionFile);

    private static async Task<ActionRuntimePackageBuilder.BuildResult> TryBuildActionRuntimeFromQuickerAsync(
        ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            return await ActionRuntimeQuickerLoader.BuildFromActionIdAsync(
                    session.Proxy,
                    actionId,
                    options.Param,
                    rpcToken)
                .ConfigureAwait(false);
        }
        catch (QuickerRpcClientException ex)
        {
            return ActionRuntimePackageBuilder.BuildResult.Fail(
                ex.ErrorCode ?? "RPC_CONNECT_FAILED",
                ex.Message);
        }
        catch (OperationCanceledException)
        {
            return ActionRuntimePackageBuilder.BuildResult.Fail(
                "RPC_TIMEOUT",
                $"RPC timed out after {options.TimeoutSeconds}s.");
        }
        catch (Exception ex)
        {
            return ActionRuntimePackageBuilder.BuildResult.Fail(
                "ACTION_GET_FAILED",
                ex.Message);
        }
    }
}
