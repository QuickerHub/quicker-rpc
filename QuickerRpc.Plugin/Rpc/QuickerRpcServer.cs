using System;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>
/// Hosts <see cref="IQuickerRpcService"/> on a named pipe using JSON-RPC 2.0 (StreamJsonRpc).
/// </summary>
public sealed class QuickerRpcServer
{
    private readonly QuickerRpcService _service = new();
    private readonly ILogger<QuickerRpcServer> _logger;
    private readonly CancellationTokenSource _shutdown = new();
    private Task? _runTask;
    private bool _loggedListening;

    public QuickerRpcServer()
        : this(NullLogger<QuickerRpcServer>.Instance)
    {
    }

    public QuickerRpcServer(ILogger<QuickerRpcServer> logger)
    {
        _logger = logger;
    }

    public void Start()
    {
        if (_runTask is not null)
        {
            return;
        }

        _runTask = Task.Run(() => RunAsync(_shutdown.Token), CancellationToken.None);
    }

    public void Stop()
    {
        _shutdown.Cancel();
        try
        {
            _runTask?.Wait(TimeSpan.FromSeconds(5));
        }
        catch
        {
            // ignore
        }
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        var pipeName = QuickerRpcPipeNames.ServerPipe;
        while (!cancellationToken.IsCancellationRequested)
        {
            NamedPipeServerStream? pipeStream = null;
            JsonRpc? jsonRpc = null;
            var backoffAfterCycle = false;
            try
            {
                pipeStream = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    NamedPipeServerStream.MaxAllowedServerInstances,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous,
                    0,
                    0,
                    QuickerRpcPipeSecurity.CreateForCrossElevationPeers());

                LogListening(pipeName);
                await pipeStream.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
                _logger.LogDebug("QuickerRpc client connected");

                jsonRpc = StreamJsonRpcFactory.StartListeningServer<IQuickerRpcService>(pipeStream, _service);
                await StreamJsonRpcCompletion.AwaitSessionAsync(jsonRpc, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex) when (jsonRpc is not null && StreamJsonRpcCompletion.IsBenignSessionEnd(ex))
            {
                _logger.LogDebug(ex, "QuickerRpc client session ended");
            }
            catch (Exception ex)
            {
                backoffAfterCycle = true;
                _logger.LogWarning(ex, "QuickerRpc server cycle failed; retrying");
            }
            finally
            {
                jsonRpc?.Dispose();
                pipeStream?.Dispose();
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            if (backoffAfterCycle)
            {
                try
                {
                    await Task.Delay(1000, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }

    private void LogListening(string pipeName)
    {
        if (_loggedListening)
        {
            _logger.LogDebug("QuickerRpc listening on named pipe: {PipeName}", pipeName);
            return;
        }

        _loggedListening = true;
        _logger.LogInformation("QuickerRpc listening on named pipe: {PipeName}", pipeName);
    }
}
