using System;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Transport;

namespace QuickerRpc.Plugin.Adapters;

internal sealed class V1ActionRunHost : IQuickerRpcActionRunHost
{
    private readonly ActionRunService _run;
    private readonly XActionTraceRunService _trace;
    private readonly ActionFloatService _float;

    public V1ActionRunHost(
        ActionRunService run,
        XActionTraceRunService trace,
        ActionFloatService actionFloat)
    {
        _run = run;
        _trace = trace;
        _float = actionFloat;
    }

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
        return Task.FromResult(_trace.RunXAction(xActionJson, inputParam, projectDirectory: null, progress, streamCallbacks));
    }

    public Task<QuickerRpcFloatActionResult> FloatAsync(
        string actionId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_float.FloatAction(actionId));
    }
}
