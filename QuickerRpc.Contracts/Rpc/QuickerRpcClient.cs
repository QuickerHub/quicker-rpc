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

    public static async Task<QuickerRpcClientSession> ConnectAsync(
        int timeoutSeconds = 15,
        bool tryBootstrap = true,
        CancellationToken cancellationToken = default)
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

        var (jsonRpc, proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(pipe);
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
}
