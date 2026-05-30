using System.Diagnostics;
using System.IO.Pipes;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Console;

internal sealed class QuickerRpcConnectException : Exception
{
    public QuickerRpcConnectException(string errorCode, string message, IReadOnlyList<string>? hints = null)
        : base(message)
    {
        ErrorCode = errorCode;
        Hints = hints ?? Array.Empty<string>();
    }

    public string ErrorCode { get; }

    public IReadOnlyList<string> Hints { get; }
}

internal static class QuickerRpcConnect
{
    public const string PluginNotRunningErrorCode = "PLUGIN_NOT_RUNNING";
    public const string ConnectTimeoutErrorCode = "CONNECT_TIMEOUT";

    private const int BootstrapPollIntervalMs = 250;
    private const int BootstrapMaxWaitSeconds = 12;

    public static bool IsPipeServerListening(string pipeName)
    {
        if (!OperatingSystem.IsWindows())
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
            "或在 Quicker 中加载 QuickerRpc 插件（QuickerRpc_Run 子程序 / load+type）",
            "验证：qkrpc ping --json",
        };

        if (bootstrapAttempted)
        {
            hints.Insert(1, "已尝试通过 quicker:runaction 自动启动插件，但未检测到 RPC 管道");
        }

        return hints;
    }

    public static string BuildPluginNotRunningMessage(string pipeName, bool bootstrapAttempted)
    {
        var bootstrapLine = bootstrapAttempted
            ? $"已尝试自动启动：{QuickerRpcBootstrap.BuildRunActionUri()}" + Environment.NewLine
            : string.Empty;

        return
            "QuickerRpc 插件未运行（命名管道不可用）。" + Environment.NewLine +
            Environment.NewLine +
            $"管道：{pipeName}" + Environment.NewLine +
            bootstrapLine +
            Environment.NewLine +
            "请检查：" + Environment.NewLine +
            "  1. Quicker 已启动" + Environment.NewLine +
            "  2. 已加载 QuickerRpc 插件" + Environment.NewLine +
            $"  3. 手动运行：{QuickerRpcBootstrap.BuildRunActionUri()}" + Environment.NewLine +
            "  4. 重试：qkrpc ping --json";
    }

    public static string BuildConnectTimeoutMessage(string pipeName, int timeoutSeconds)
    {
        return
            $"连接 QuickerRpc 管道超时（{timeoutSeconds}s）：{pipeName}" + Environment.NewLine +
            Environment.NewLine +
            "管道存在但未能建立连接。Quicker 可能繁忙，或插件仍在启动中。" + Environment.NewLine +
            "请重试：qkrpc ping --json";
    }

    public static async Task<(NamedPipeClientStream Pipe, JsonRpc JsonRpc, IQuickerRpcService Proxy)> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap = true)
    {
        var pipeName = QuickerRpcPipeNames.ServerPipe;
        var bootstrapAttempted = false;

        if (!IsPipeServerListening(pipeName) && tryBootstrap)
        {
            bootstrapAttempted = await TryBootstrapPluginAsync(pipeName, timeoutSeconds).ConfigureAwait(false);
        }

        if (!IsPipeServerListening(pipeName))
        {
            throw new QuickerRpcConnectException(
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

        using var connectCts = new CancellationTokenSource(TimeSpan.FromSeconds(connectTimeoutSeconds));
        try
        {
            await pipe.ConnectAsync(connectCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            await pipe.DisposeAsync().ConfigureAwait(false);
            throw new QuickerRpcConnectException(
                ConnectTimeoutErrorCode,
                BuildConnectTimeoutMessage(pipeName, connectTimeoutSeconds),
                BuildPluginNotRunningHints(bootstrapAttempted));
        }
        catch (Exception ex)
        {
            await pipe.DisposeAsync().ConfigureAwait(false);
            throw new QuickerRpcConnectException(
                ConnectTimeoutErrorCode,
                $"连接 QuickerRpc 管道失败 '{pipeName}'：{ex.Message}",
                BuildPluginNotRunningHints(bootstrapAttempted));
        }

        var (jsonRpc, proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(pipe);
        return (pipe, jsonRpc, proxy);
    }

    public static CancellationToken CreateRpcCancellationToken(int timeoutSeconds)
    {
        return new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds))).Token;
    }

    private static async Task<bool> TryBootstrapPluginAsync(string pipeName, int timeoutSeconds)
    {
        if (!OperatingSystem.IsWindows())
        {
            return false;
        }

        WriteBootstrapStatus($"QuickerRpc 插件未运行，正在尝试启动：{QuickerRpcBootstrap.BuildRunActionUri()}");

        if (!TryLaunchPluginRunAction())
        {
            WriteBootstrapStatus("无法通过 quicker:runaction 启动 Quicker（Quicker 可能未安装或未注册协议）。");
            return true;
        }

        var waitSeconds = Math.Min(BootstrapMaxWaitSeconds, Math.Max(3, timeoutSeconds));
        WriteBootstrapStatus($"等待插件就绪（最多 {waitSeconds}s）...");

        var deadline = DateTime.UtcNow.AddSeconds(waitSeconds);
        while (DateTime.UtcNow < deadline)
        {
            if (IsPipeServerListening(pipeName))
            {
                WriteBootstrapStatus("QuickerRpc 插件已就绪。");
                return true;
            }

            await Task.Delay(BootstrapPollIntervalMs).ConfigureAwait(false);
        }

        WriteBootstrapStatus("等待插件就绪超时。");
        return true;
    }

    private static bool TryLaunchPluginRunAction()
    {
        try
        {
            Process.Start(new ProcessStartInfo(QuickerRpcBootstrap.BuildRunActionUri())
            {
                UseShellExecute = true,
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static void WriteBootstrapStatus(string message)
    {
        global::System.Console.Error.WriteLine(message);
    }
}
