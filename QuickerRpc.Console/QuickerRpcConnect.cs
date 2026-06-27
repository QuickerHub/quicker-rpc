using System.Collections.Generic;
using System.IO.Pipes;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;
using TransportClient = QuickerRpc.Transport.QuickerRpcClient;

namespace QuickerRpc.Console;

internal static class QuickerRpcConnect
{
    public const string PluginNotRunningErrorCode = TransportClient.PluginNotRunningErrorCode;
    public const string ConnectTimeoutErrorCode = TransportClient.ConnectTimeoutErrorCode;

    public static bool IsPipeServerListening(string pipeName) =>
        TransportClient.IsPipeServerListening(pipeName);

    public static IReadOnlyList<string> BuildPluginNotRunningHints(bool bootstrapAttempted) =>
        TransportClient.BuildPluginNotRunningHints(bootstrapAttempted);

    public static string BuildPluginNotRunningMessage(string pipeName, bool bootstrapAttempted) =>
        TransportClient.BuildPluginNotRunningMessage(pipeName, bootstrapAttempted);

    public static string BuildConnectTimeoutMessage(string pipeName, int timeoutSeconds) =>
        $"连接 QuickerRpc 管道超时（{timeoutSeconds}s）：{pipeName}";

    public static async Task<(NamedPipeClientStream Pipe, JsonRpc JsonRpc, IQuickerRpcService Proxy)> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap = true) =>
        await ConnectAsync(timeoutSeconds, tryBootstrap, clientRpcTarget: null).ConfigureAwait(false);

    public static async Task<(NamedPipeClientStream Pipe, JsonRpc JsonRpc, IQuickerRpcService Proxy)> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap,
        object? clientRpcTarget)
    {
        var session = await TransportClient
            .ConnectAsync(timeoutSeconds, tryBootstrap, clientRpcTarget, cancellationToken: default)
            .ConfigureAwait(false);
        return (session.Pipe, session.JsonRpc, session.Rpc);
    }

    public static CancellationToken CreateRpcCancellationToken(int timeoutSeconds) =>
        TransportClient.CreateRpcCancellationToken(timeoutSeconds);
}
