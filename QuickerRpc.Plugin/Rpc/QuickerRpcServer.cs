using System;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Plugin.Rpc;

/// <summary>
/// Hosts <see cref="IQuickerRpcService"/> on a named pipe using JSON-RPC 2.0 (StreamJsonRpc).
/// </summary>
public sealed class QuickerRpcServer : IHostedService
{
    private readonly IQuickerRpcService _service;
    private readonly ILogger<QuickerRpcServer> _logger;
    private readonly CancellationTokenSource _shutdown = new();
    private Task? _runTask;
    private bool _loggedListening;

    public QuickerRpcServer(IQuickerRpcService service, ILogger<QuickerRpcServer> logger)
    {
        _service = service;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _runTask = Task.Run(() => RunAsync(_shutdown.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _shutdown.Cancel();
        if (_runTask is null)
        {
            return;
        }

        try
        {
            var finished = await Task.WhenAny(_runTask, Task.Delay(TimeSpan.FromSeconds(5), CancellationToken.None))
                .ConfigureAwait(false);
            if (finished != _runTask)
            {
                _logger.LogWarning("QuickerRpc server loop did not stop within timeout.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "QuickerRpc server loop ended.");
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
                QuickerRpcConnectionState.SetConnected(true);

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
                QuickerRpcConnectionState.SetConnected(false);
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
