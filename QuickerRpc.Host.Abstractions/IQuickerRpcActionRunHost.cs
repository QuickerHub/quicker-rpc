using System;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

/// <summary>Run, trace-run, and float local Quicker actions.</summary>
public interface IQuickerRpcActionRunHost
{
    Task<QuickerRpcActionRunResult> RunAsync(
        string actionId,
        string? inputParam = null,
        bool enableDebugging = false,
        bool waitForComplete = false,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionTraceRunResult> RunTraceAsync(
        string actionId,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcActionTraceRunResult> RunXActionTraceAsync(
        string xActionJson,
        string? inputParam = null,
        IProgress<QuickerRpcActionTraceEvent>? progress = null,
        CancellationToken cancellationToken = default);

    Task<QuickerRpcFloatActionResult> FloatAsync(
        string actionId,
        CancellationToken cancellationToken = default);
}
