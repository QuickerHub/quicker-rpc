using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport;

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
            "请确认 Quicker 已运行",
            $"或手动运行：{QuickerRpcBootstrap.BuildRunActionUri()}",
            "并在 Quicker 内加载 QuickerRpc 插件",
            "请重试：qkrpc ping --json",
        };

        if (!QuickerRpcBootstrapPolicy.IsQuickerProcessRunning())
        {
            hints.Insert(1, "Quicker 未运行；启动后执行 quicker:runaction 或 QuickerAgent 动作");
        }
        else if (bootstrapAttempted)
        {
            hints.Insert(1, "已尝试 quicker:runaction 自动拉起；请确认动作存在且 RPC 插件已启动");
        }

        return hints;
    }

    public static string BuildPluginNotRunningMessage(string pipeName, bool bootstrapAttempted)
    {
        var bootstrapLine = bootstrapAttempted
            ? $"已尝试自动拉起：{QuickerRpcBootstrap.BuildRunActionUri()}{Environment.NewLine}"
            : string.Empty;

        return
            "QuickerRpc 插件未运行或命名管道不可用。" + Environment.NewLine +
            Environment.NewLine +
            $"管道：{pipeName}" + Environment.NewLine +
            bootstrapLine +
            Environment.NewLine +
            "请在 Quicker 中加载 QuickerRpc 插件后重试。";
    }

    public static Task<QuickerRpcClientSession> ConnectAsync(
        int timeoutSeconds = 15, bool tryBootstrap = true, CancellationToken cancellationToken = default) =>
        ConnectAsync(timeoutSeconds, tryBootstrap, null, cancellationToken);

    public static Task<QuickerRpcClientSession> ConnectAsync(
        int timeoutSeconds, bool tryBootstrap, object? clientRpcTarget, CancellationToken cancellationToken)
    {
        var rawBinding = Environment.GetEnvironmentVariable("QKRPC_HOST_BINDING");
        if (!string.IsNullOrWhiteSpace(rawBinding))
        {
            var binding = Newtonsoft.Json.JsonConvert.DeserializeObject<QuickerRpcHostBinding>(rawBinding!)
                ?? throw new QuickerRpcClientException(QuickerRpcBindingErrors.Required, "Invalid QKRPC_HOST_BINDING.");
            return ConnectBoundAsync(binding, timeoutSeconds, clientRpcTarget, cancellationToken);
        }
        return ConnectSelectedAsync(new QuickerRpcHostSelection { HostSessionId = Environment.GetEnvironmentVariable("QKRPC_HOST_SESSION") },
            timeoutSeconds, tryBootstrap, clientRpcTarget, cancellationToken);
    }

    public static async Task<QuickerRpcClientSession> ConnectSelectedAsync(
        QuickerRpcHostSelection selection, int timeoutSeconds = 15, bool tryBootstrap = false,
        object? clientRpcTarget = null, CancellationToken cancellationToken = default)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));
        try
        {
            var candidates = await QuickerRpcHostDiscovery.DiscoverAsync(selection, deadline.Token).ConfigureAwait(false);
            if (candidates.Count == 0 && selection.CandidateEndpoints is null && string.IsNullOrWhiteSpace(selection.HostSessionId))
            {
                if (tryBootstrap && !IsPipeServerListening())
                {
                    await TryBootstrapPluginAsync(QuickerRpcPipeNames.ServerPipe, timeoutSeconds, false, deadline.Token).ConfigureAwait(false);
                    candidates = await QuickerRpcHostDiscovery.DiscoverAsync(selection, deadline.Token).ConfigureAwait(false);
                }
                if (candidates.Count == 0 && selection.RequiredCapabilities.Count == 0 && IsPipeServerListening())
                    return await ConnectEndpointAsync(QuickerRpcPipeNames.ServerPipe, clientRpcTarget, deadline.Token).ConfigureAwait(false);
            }
            var binding = QuickerRpcHostDiscovery.Select(candidates, selection.HostSessionId);
            return await ConnectBoundAsync(binding, timeoutSeconds, clientRpcTarget, deadline.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new QuickerRpcClientException(ConnectTimeoutErrorCode, "Host discovery/handshake timed out.");
        }
    }

    public static async Task<QuickerRpcClientSession> ConnectBoundAsync(
        QuickerRpcHostBinding binding, int timeoutSeconds = 15, object? clientRpcTarget = null,
        CancellationToken cancellationToken = default)
    {
        if (binding is null) throw new ArgumentNullException(nameof(binding));
        if (!QuickerRpcEndpointNames.IsCurrentUserEndpoint(binding.Endpoint))
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.Mismatch, "The binding endpoint is outside the current user's namespace.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));
        QuickerRpcClientSession? session = null;
        try
        {
            session = await ConnectEndpointAsync(binding.Endpoint, clientRpcTarget, deadline.Token).ConfigureAwait(false);
            if (session.Binding is null || !binding.SameDestination(session.Binding)
                || binding.ProtocolVersion != session.Binding.ProtocolVersion || binding.SchemaVersion != session.Binding.SchemaVersion)
                throw new QuickerRpcClientException(QuickerRpcBindingErrors.Mismatch, "The endpoint no longer belongs to the bound host session. Reopen explicitly.");
            return session;
        }
        catch (Exception ex)
        {
            if (session is not null) await session.DisposeAsync().ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            if (ex is QuickerRpcClientException) throw;
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.Unavailable, "The bound host session is unavailable. No other host was contacted. " + ex.Message);
        }
    }

    internal static async Task<QuickerRpcClientSession> ConnectEndpointAsync(
        string endpoint, object? clientRpcTarget, CancellationToken cancellationToken)
    {
        // Windows validates the server's owner against Token.User below. CurrentUserOnly uses
        // Token.Owner, which can be Administrators for an elevated client of the same user.
        var options = PipeOptions.Asynchronous;
#if !NET472
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            options |= (PipeOptions)0x20000000; // CurrentUserOnly, including netstandard clients.
#endif
        var pipe = new NamedPipeClientStream(".", endpoint, PipeDirection.InOut,
            options);
        QuickerRpcClientSession? session = null;
        try
        {
            await pipe.ConnectAsync(cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
#if NET472
            QuickerRpcPipeClientSecurity.RequireCurrentUserOwner(pipe);
#else
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                QuickerRpcPipeClientSecurity.RequireCurrentUserOwner(pipe);
#endif
            cancellationToken.ThrowIfCancellationRequested();
            var (jsonRpc, proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(pipe, clientRpcTarget);
            session = new QuickerRpcClientSession(pipe, jsonRpc, proxy);
            var info = await QuickerRpcHostSessionClient.TryGetAsync(proxy, cancellationToken).ConfigureAwait(false);
            // The shared alias is deliberately unbindable, even when a modern server answers it.
            if (endpoint != QuickerRpcPipeNames.ServerPipe)
                session.Bind(QuickerRpcHostDiscovery.Verify(info, endpoint));
            return session;
        }
        catch
        {
            if (session is not null) await session.DisposeAsync().ConfigureAwait(false);
            else pipe.Dispose();
            throw;
        }
    }

    public static QuickerRpcHostBinding? GetBinding(IQuickerRpcService rpc) =>
        (rpc as QuickerRpcGuardedService)?.Binding;

    public static void RequireBinding(IQuickerRpcService rpc, QuickerRpcHostBinding expected)
    {
        var actual = GetBinding(rpc);
        if (actual is null || !expected.SameDestination(actual))
            throw new QuickerRpcClientException(QuickerRpcBindingErrors.Mismatch, "The document and RPC connection belong to different host sessions.");
    }

    public static CancellationToken CreateRpcCancellationToken(int timeoutSeconds) =>
        new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds))).Token;

    private static async Task<bool> TryBootstrapPluginAsync(
        string pipeName,
        int timeoutSeconds,
        bool bypassCooldown,
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

        var recentlyAttempted = !bypassCooldown && QuickerRpcBootstrapPolicy.WasBootstrapRecentlyAttempted();
        var launched = QuickerRpcBootstrapPolicy.TryLaunchPluginRunAction(bypassCooldown);
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
                            bypassCooldown: bootstrapAttempted,
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
                catch (QuickerRpcClientException ex) when (ex.ErrorCode != QuickerRpcBindingErrors.Ambiguous)
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
                    $"QuickerRpc 在 {timeoutSeconds}s 内未就绪（已轮询 {attempts} 次）。",
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
