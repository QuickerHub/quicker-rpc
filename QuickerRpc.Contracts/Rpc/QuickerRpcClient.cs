using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>
/// Connects to the QuickerRpc plugin over the server named pipe (same as <c>qkrpc</c> CLI).
/// </summary>
public static class QuickerRpcClient
{
    public const string PluginNotRunningErrorCode = "PLUGIN_NOT_RUNNING";
    public const string ConnectTimeoutErrorCode = "CONNECT_TIMEOUT";
    public const string WaitTimeoutErrorCode = "WAIT_TIMEOUT";

    private const int BootstrapPollIntervalMs = 250;
    private const int BootstrapMaxWaitSeconds = 12;

    public static bool IsPipeServerListening(string? pipeName = null)
    {
        pipeName ??= QuickerRpcPipeNames.ServerPipe;
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return false;
        }

        try
        {
            return File.Exists($@"\\.\pipe\{pipeName}");
        }
        catch
        {
            return false;
        }
    }

    public static IReadOnlyList<string> BuildPluginNotRunningHints(bool bootstrapAttempted)
    {
        var hints = new List<string>
        {
            "确认 Quicker 已启动",
            $"可手动运行：{QuickerRpcBootstrap.BuildRunActionUri()}",
            "或在 Quicker 中加载 QuickerRpc 插件",
            "验证：qkrpc ping --json",
        };

        if (!QuickerRpcBootstrapPolicy.IsQuickerProcessRunning())
        {
            hints.Insert(1, "Quicker 进程未运行，已跳过 quicker:runaction（避免重复弹窗）");
        }
        else if (bootstrapAttempted)
        {
            hints.Insert(1, "已尝试通过 quicker:runaction 自动启动插件，但未检测到 RPC 管道");
        }

        return hints;
    }

    public static string BuildPluginNotRunningMessage(string pipeName, bool bootstrapAttempted)
    {
        var bootstrapLine = bootstrapAttempted
            ? $"已尝试自动启动：{QuickerRpcBootstrap.BuildRunActionUri()}{Environment.NewLine}"
            : string.Empty;

        return
            "QuickerRpc 插件未运行（命名管道不可用）。" + Environment.NewLine +
            Environment.NewLine +
            $"管道：{pipeName}" + Environment.NewLine +
            bootstrapLine +
            Environment.NewLine +
            "请检查 Quicker 已启动且已加载 QuickerRpc 插件。";
    }

    public static Task<QuickerRpcClientSession> ConnectAsync(
        int timeoutSeconds = 15,
        bool tryBootstrap = true,
        CancellationToken cancellationToken = default) =>
        ConnectAsync(timeoutSeconds, tryBootstrap, clientRpcTarget: null, cancellationToken);

    public static async Task<QuickerRpcClientSession> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap,
        object? clientRpcTarget,
        CancellationToken cancellationToken)
    {
        var pipeName = QuickerRpcPipeNames.ServerPipe;
        var bootstrapAttempted = false;

        if (!IsPipeServerListening(pipeName) && tryBootstrap)
        {
            bootstrapAttempted = await TryBootstrapPluginAsync(pipeName, timeoutSeconds, cancellationToken)
                .ConfigureAwait(false);
        }

        if (!IsPipeServerListening(pipeName))
        {
            throw new QuickerRpcClientException(
                PluginNotRunningErrorCode,
                BuildPluginNotRunningMessage(pipeName, bootstrapAttempted),
                BuildPluginNotRunningHints(bootstrapAttempted));
        }

        var connectTimeoutSeconds = Math.Max(1, timeoutSeconds);
        var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);

        using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        connectCts.CancelAfter(TimeSpan.FromSeconds(connectTimeoutSeconds));

        try
        {
            await pipe.ConnectAsync(connectCts.Token).ConfigureAwait(false);
            QuickerRpcBootstrapPolicy.ResetCooldown();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            pipe.Dispose();
            throw new QuickerRpcClientException(
                ConnectTimeoutErrorCode,
                $"连接 QuickerRpc 管道超时（{connectTimeoutSeconds}s）：{pipeName}",
                BuildPluginNotRunningHints(bootstrapAttempted));
        }
        catch (Exception ex)
        {
            pipe.Dispose();
            throw new QuickerRpcClientException(
                ConnectTimeoutErrorCode,
                $"连接 QuickerRpc 管道失败 '{pipeName}'：{ex.Message}",
                BuildPluginNotRunningHints(bootstrapAttempted));
        }

        var (jsonRpc, proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(pipe, clientRpcTarget);
        return new QuickerRpcClientSession(pipe, jsonRpc, proxy);
    }

    public static CancellationToken CreateRpcCancellationToken(int timeoutSeconds) =>
        new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds))).Token;

    private static async Task<bool> TryBootstrapPluginAsync(
        string pipeName,
        int timeoutSeconds,
        CancellationToken cancellationToken)
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return false;
        }

        if (!QuickerRpcBootstrapPolicy.IsQuickerProcessRunning())
        {
            return false;
        }

        var recentlyAttempted = QuickerRpcBootstrapPolicy.WasBootstrapRecentlyAttempted();
        var launched = QuickerRpcBootstrapPolicy.TryLaunchPluginRunAction();
        if (!launched)
        {
            return recentlyAttempted;
        }

        var waitSeconds = Math.Min(BootstrapMaxWaitSeconds, Math.Max(3, timeoutSeconds));
        var deadline = DateTime.UtcNow.AddSeconds(waitSeconds);
        while (DateTime.UtcNow < deadline)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (IsPipeServerListening(pipeName))
            {
                return true;
            }

            await Task.Delay(BootstrapPollIntervalMs, cancellationToken).ConfigureAwait(false);
        }

        return true;
    }

    /// <summary>
    /// Poll until the plugin pipe accepts RPC ping, or throw when <paramref name="timeoutSeconds"/> elapses.
    /// </summary>
    public static async Task<QuickerRpcWaitResult> WaitForPluginAsync(
        int timeoutSeconds = 120,
        int pollIntervalSeconds = 2,
        bool tryBootstrap = true,
        CancellationToken cancellationToken = default)
    {
        var pipeName = QuickerRpcPipeNames.ServerPipe;
        var startedUtc = DateTime.UtcNow;
        var deadline = startedUtc.AddSeconds(Math.Max(1, timeoutSeconds));
        var pollMs = Math.Max(250, Math.Min(pollIntervalSeconds * 1000, 30_000));
        var attempts = 0;
        var bootstrapAttempted = false;
        DateTime? lastBootstrapUtc = null;
        const int bootstrapRetrySeconds = 20;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            attempts++;

            if (!IsPipeServerListening(pipeName) && tryBootstrap)
            {
                var shouldBootstrap = lastBootstrapUtc == null
                    || (DateTime.UtcNow - lastBootstrapUtc.Value).TotalSeconds >= bootstrapRetrySeconds;
                if (shouldBootstrap)
                {
                    lastBootstrapUtc = DateTime.UtcNow;
                    var launched = await TryBootstrapPluginAsync(
                            pipeName,
                            Math.Min(BootstrapMaxWaitSeconds, timeoutSeconds),
                            cancellationToken)
                        .ConfigureAwait(false);
                    bootstrapAttempted = bootstrapAttempted || launched;
                }
            }

            if (IsPipeServerListening(pipeName))
            {
                try
                {
                    await using var session = await ConnectAsync(
                            timeoutSeconds: 5,
                            tryBootstrap: false,
                            cancellationToken: cancellationToken)
                        .ConfigureAwait(false);
                    var rpcToken = CreateRpcCancellationToken(5);
                    var pong = await session.Rpc.PingAsync(rpcToken).ConfigureAwait(false);
                    var version = await session.Rpc.GetProtocolVersionAsync(rpcToken).ConfigureAwait(false);
                    var elapsedMs = (int)Math.Max(0, (DateTime.UtcNow - startedUtc).TotalMilliseconds);
                    return new QuickerRpcWaitResult
                    {
                        Pong = pong,
                        ProtocolVersion = version,
                        ElapsedMs = elapsedMs,
                        Attempts = attempts,
                        BootstrapAttempted = bootstrapAttempted,
                    };
                }
                catch (QuickerRpcClientException)
                {
                    // Pipe visible but session not ready yet — keep polling.
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    // Per-attempt connect timeout — keep polling until global deadline.
                }
            }

            if (DateTime.UtcNow >= deadline)
            {
                throw new QuickerRpcClientException(
                    WaitTimeoutErrorCode,
                    $"QuickerRpc 在 {timeoutSeconds}s 内未就绪（尝试 {attempts} 次）。",
                    BuildPluginNotRunningHints(bootstrapAttempted));
            }

            var remainingMs = (int)Math.Max(0, (deadline - DateTime.UtcNow).TotalMilliseconds);
            var delayMs = Math.Min(pollMs, remainingMs);
            if (delayMs > 0)
            {
                await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
            }
        }
    }
}
