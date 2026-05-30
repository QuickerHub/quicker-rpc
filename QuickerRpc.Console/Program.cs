using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CommandLine;
using Microsoft.Extensions.Logging;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Console;

/// <summary>Exit codes for scripting.</summary>
public static class ExitCodes
{
    public const int Success = 0;
    public const int Error = 1;
}

internal static class Program
{
    private const int PipeConnectTimeoutMilliseconds = 15000;

    private static readonly JsonSerializerOptions JsonWriteOptions = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static async Task<int> Main(string[] args)
    {
        ConfigureConsoleUtf8();

        var result = Parser.Default.ParseArguments<PingOptions, ActionUpdateOptions>(args);
        return await result
            .MapResult(
                (PingOptions o) => RunPingAsync(o),
                (ActionUpdateOptions o) => RunActionUpdateAsync(o),
                _ => Task.FromResult(ExitCodes.Error))
            .ConfigureAwait(false);
    }

    private static void ConfigureConsoleUtf8()
    {
        try
        {
            var utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            global::System.Console.OutputEncoding = utf8NoBom;
            global::System.Console.InputEncoding = utf8NoBom;
        }
        catch
        {
            // ignore
        }
    }

    private static async Task<int> RunPingAsync(PingOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var pong = await session.Proxy.PingAsync(CancellationToken.None).ConfigureAwait(false);
            var version = await session.Proxy.GetProtocolVersionAsync(CancellationToken.None).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = true,
                        action = "ping",
                        pong,
                        protocolVersion = version,
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    JsonWriteOptions));
            }
            else
            {
                global::System.Console.WriteLine($"pong (protocol {version}, pipe {QuickerRpcPipeNames.ServerPipe})");
            }

            return ExitCodes.Success;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "PING_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionUpdateAsync(ActionUpdateOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        if (verb != "update")
        {
            await EmitErrorAsync(options.Json, "UNKNOWN_ACTION_VERB", "Use: action update --id <sharedActionId> [--changelog ...] [--json]")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <sharedActionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var result = await session.Proxy
                .UpdateSharedActionAsync(actionId, options.Changelog, CancellationToken.None)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "update",
                        sharedId = result.ActionId ?? actionId,
                        message = result.Message,
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    JsonWriteOptions));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(result.Message);
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "UPDATE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<RpcClientSession> ConnectAsync(int timeoutSeconds)
    {
        var pipeName = QuickerRpcPipeNames.ServerPipe;
        var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);

        using var connectCts = new CancellationTokenSource(TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds)));
        try
        {
            await pipe.ConnectAsync(connectCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw new InvalidOperationException(
                $"Timed out connecting to QuickerRpc pipe '{pipeName}'. " +
                "Ensure Quicker is running and the QuickerRpc plugin has been loaded (Register).");
        }

        var (jsonRpc, proxy) = StreamJsonRpcSession.CreateClient<IQuickerRpcService>(pipe);
        return new RpcClientSession(pipe, jsonRpc, proxy);
    }

    private static Task EmitErrorAsync(bool json, string code, string message)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = false, error = code, message },
                JsonWriteOptions));
        }
        else
        {
            global::System.Console.Error.WriteLine($"{code}: {message}");
        }

        return Task.CompletedTask;
    }

    private sealed class RpcClientSession : IAsyncDisposable
    {
        private readonly NamedPipeClientStream _pipe;
        private readonly JsonRpc _jsonRpc;

        public RpcClientSession(NamedPipeClientStream pipe, JsonRpc jsonRpc, IQuickerRpcService proxy)
        {
            _pipe = pipe;
            _jsonRpc = jsonRpc;
            Proxy = proxy;
        }

        public IQuickerRpcService Proxy { get; }

        public async ValueTask DisposeAsync()
        {
            _jsonRpc.Dispose();
            await _pipe.DisposeAsync().ConfigureAwait(false);
        }
    }
}

[Verb("ping", HelpText = "Check connectivity to the QuickerRpc plugin.")]
public sealed class PingOptions
{
    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 15, HelpText = "Pipe connect timeout in seconds.")]
    public int TimeoutSeconds { get; set; }
}

[Verb("action", HelpText = "Quicker action operations via RPC.")]
public sealed class ActionUpdateOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "update")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Shared action id (GUID).")]
    public string? Id { get; set; }

    [Option("code", HelpText = "Alias for --id.")]
    public string? Code { get; set; }

    [Option("changelog", HelpText = "Optional change log message.")]
    public string? Changelog { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 15, HelpText = "Pipe connect timeout in seconds.")]
    public int TimeoutSeconds { get; set; }
}
