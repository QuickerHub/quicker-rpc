using System;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Services;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>
/// Run local actions via shared <see cref="ActionRunService"/> reflection;
/// trace via V2 <see cref="V2XActionTraceRunService"/>.
/// </summary>
internal sealed class V2ActionRunHost : IQuickerRpcActionRunHost
{
    private readonly ActionRunService _run = new();
    private readonly V2XActionTraceRunService _trace = new();

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
        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return Task.FromResult(_trace.RunAction(actionId, inputParam, progress, streamCallbacks));
    }

    public Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var streamCallbacks = QuickerRpcTraceSink.CurrentClientCallbacks;
        return Task.FromResult(_trace.RunXAction(xActionJson, inputParam, progress, streamCallbacks));
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
