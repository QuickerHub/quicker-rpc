using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Testing;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Apply workspace compiled program to a Quicker sandbox action and trace-run via RPC.
/// </summary>
public static class WorkspaceActionLiveRunner
{
    public const string SandboxActionTitle = "_rpc_test";

    public sealed class RunOptions
    {
        /// <summary>When set, apply + run on this Quicker action id instead of resolving sandbox.</summary>
        public string? TargetActionId { get; set; }

        public string? InputParam { get; set; }

        public bool ForceApply { get; set; } = true;

        public bool RestoreSandboxBodyAfterRun { get; set; } = true;
    }

    public static async Task<(QuickerRpcActionTraceRunResult Result, string TargetActionId)> RunAsync(
        IQuickerRpcService rpc,
        WorkspaceActionTestEnvironment.LoadedProject project,
        RunOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        options ??= new RunOptions();
        var ct = cancellationToken;

        var targetActionId = (options.TargetActionId ?? string.Empty).Trim();
        if (targetActionId.Length == 0)
        {
            targetActionId = await ResolveSandboxActionIdAsync(rpc, ct).ConfigureAwait(false);
        }

        string? backupJson = null;
        if (options.RestoreSandboxBodyAfterRun)
        {
            backupJson = await ReadProgramJsonAsync(rpc, targetActionId, ct).ConfigureAwait(false);
        }

        var apply = await rpc
            .ApplyXActionToActionAsync(
                targetActionId,
                project.CompiledJson,
                expectedEditVersion: null,
                force: options.ForceApply,
                cancellationToken: ct)
            .ConfigureAwait(false);
        if (!apply.Success)
        {
            return (new QuickerRpcActionTraceRunResult
            {
                Ok = false,
                Message = apply.ErrorMessage ?? "ApplyXActionToAction failed.",
                ErrorMessage = apply.ErrorMessage,
                ActionId = targetActionId,
            }, targetActionId);
        }

        QuickerRpcActionTraceRunResult trace;
        try
        {
            trace = await rpc
                .RunActionTraceAsync(targetActionId, options.InputParam, progress: null, cancellationToken: ct)
                .ConfigureAwait(false);
        }
        finally
        {
            if (options.RestoreSandboxBodyAfterRun && backupJson is not null)
            {
                _ = await rpc
                    .ApplyXActionToActionAsync(
                        targetActionId,
                        backupJson,
                        expectedEditVersion: null,
                        force: true,
                        cancellationToken: ct)
                    .ConfigureAwait(false);
            }
        }

        return (trace, targetActionId);
    }

    public static async Task<string> ResolveSandboxActionIdAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken)
    {
        var search = await rpc
            .SearchActionSummariesAsync(SandboxActionTitle, maxResults: 30, scope: null, sort: null, cancellationToken)
            .ConfigureAwait(false);
        if (search.Success && search.Items is not null)
        {
            foreach (var item in search.Items)
            {
                if (string.Equals((item.Title ?? string.Empty).Trim(), SandboxActionTitle, StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(item.ActionId))
                {
                    return item.ActionId!.Trim();
                }
            }
        }

        var created = await rpc
            .CreateActionAsync(
                SandboxActionTitle,
                "QuickerRpc workspace live-test sandbox.",
                icon: null,
                profileId: null,
                cancellationToken)
            .ConfigureAwait(false);
        if (!created.Ok || string.IsNullOrWhiteSpace(created.ActionId))
        {
            throw new InvalidOperationException(created.Message ?? "Failed to create sandbox action _rpc_test.");
        }

        return created.ActionId!.Trim();
    }

    private static async Task<string?> ReadProgramJsonAsync(
        IQuickerRpcService rpc,
        string actionId,
        CancellationToken cancellationToken)
    {
        var get = await rpc
            .GetCompressedActionByIdAsync(actionId, returnMode: "full", cancellationToken)
            .ConfigureAwait(false);
        if (!get.Success || string.IsNullOrWhiteSpace(get.CompressedJson))
        {
            return null;
        }

        return get.CompressedJson;
    }
}

/// <summary>Connect to QuickerRpc pipe or mark test inconclusive.</summary>
internal static class WorkspaceActionLiveTestHelper
{
    public static async Task<QuickerRpcClientSession> ConnectOrInconclusiveAsync(TestContext context)
    {
        try
        {
            var tryBootstrap = !string.Equals(
                Environment.GetEnvironmentVariable("QUICKER_RPC_NO_BOOTSTRAP"),
                "1",
                StringComparison.OrdinalIgnoreCase);
            var timeout = int.TryParse(
                Environment.GetEnvironmentVariable("QUICKER_RPC_CONNECT_TIMEOUT"),
                out var seconds) && seconds > 0
                ? seconds
                : 20;

            var session = await QuickerRpcClient.ConnectAsync(timeout, tryBootstrap).ConfigureAwait(false);
            context.WriteLine("Connected pipe: " + QuickerRpcPipeNames.ServerPipe);
            return session;
        }
        catch (QuickerRpcClientException ex)
        {
            context.WriteLine(ex.Message);
            foreach (var hint in ex.Hints)
            {
                context.WriteLine("  - " + hint);
            }

            Assert.Inconclusive(
                "QuickerRpc plugin unavailable (" + ex.ErrorCode + "). Start Quicker, load plugin, or set QUICKER_RPC_NO_BOOTSTRAP=0.");
            throw;
        }
    }
}
