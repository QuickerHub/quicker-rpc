using QuickerRpc.Console.ActionRuntime;
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
            options.Param,
            options.CompressedFile);

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
        && string.IsNullOrWhiteSpace(options.CompressedFile)
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
