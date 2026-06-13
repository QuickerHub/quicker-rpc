#if ACTION_RUNTIME_MOCK
using QuickerRpc.Console.ActionRuntime;
using QuickerRpc.Console.ActionRuntime.Mock;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
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
}
#endif
