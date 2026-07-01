using System;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>Run local actions via shared V1 <see cref="ActionRunService"/> reflection.</summary>
internal sealed class V2ActionRunHost : IQuickerRpcActionRunHost
{
    private readonly ActionRunService _run = new();

    public Task<QuickerRpcActionRunResult> RunAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_run.RunAction(actionId, inputParam, enableDebugging, waitForComplete));
    }

    public Task<QuickerRpcActionTraceRunResult> RunTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcActionTraceRunResult
        {
            Ok = false,
            ActionId = actionId,
            Message = V2StubMessage.TraceNotImplemented,
        });
    }

    public Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcActionTraceRunResult
        {
            Ok = false,
            Message = V2StubMessage.TraceNotImplemented,
        });
    }

    public Task<QuickerRpcFloatActionResult> FloatAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(new QuickerRpcFloatActionResult
        {
            Ok = false,
            ActionId = actionId,
            Message = "Float action is not supported on Quicker V2 reflection host yet.",
        });
    }
}
