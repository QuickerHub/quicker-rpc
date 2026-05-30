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

        if (TryWriteHelpJson(args))
        {
            return ExitCodes.Success;
        }

        var result = Parser.Default.ParseArguments<PingOptions, ActionOptions>(args);
        return await result
            .MapResult(
                (PingOptions o) => RunPingAsync(o),
                (ActionOptions o) => RunActionAsync(o),
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

    private static async Task<int> RunActionAsync(ActionOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "update" => await RunActionUpdateAsync(options).ConfigureAwait(false),
            "search" => await RunActionSearchAsync(options).ConfigureAwait(false),
            "delete" => await RunActionDeleteAsync(options).ConfigureAwait(false),
            "edit" => await RunActionEditAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownActionVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownActionVerbAsync(ActionOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_ACTION_VERB",
            "Use: action update --id <sharedActionId> [--changelog ... | --changelog-file <path>] [--json] " +
            "or action search --query <keyword> [--limit 20] [--json] " +
            "or action delete --id <actionId> --yes [--json] " +
            "or action edit --id <actionId> [--json]")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunActionUpdateAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <sharedActionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (changelogOk, changelog, changelogErrorCode, changelogErrorMessage) = ResolveChangelog(options);
        if (!changelogOk)
        {
            await EmitErrorAsync(options.Json, changelogErrorCode!, changelogErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var result = await session.Proxy
                .UpdateSharedActionAsync(actionId, changelog, CancellationToken.None)
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

    private static async Task<int> RunActionSearchAsync(ActionOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            await EmitErrorAsync(options.Json, "MISSING_QUERY", "Provide --query <keyword>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var result = await session.Proxy
                .SearchActionsAsync(query, options.Limit, CancellationToken.None)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "search",
                        query,
                        count = result.Items.Count,
                        items = result.Items,
                        message = string.IsNullOrWhiteSpace(result.Message) ? null : result.Message,
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    JsonWriteOptions));
            }
            else if (result.Ok)
            {
                if (result.Items.Count == 0)
                {
                    global::System.Console.WriteLine(result.Message);
                }
                else
                {
                    foreach (var item in result.Items)
                    {
                        global::System.Console.WriteLine($"{item.Id}\t{item.Title}\t{item.PageTitle}");
                    }
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "SEARCH_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionDeleteAsync(ActionOptions options)
    {
        if (!options.Yes)
        {
            await EmitErrorAsync(
                options.Json,
                "CONFIRMATION_REQUIRED",
                "Destructive operation: pass --yes to delete the action.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var result = await session.Proxy
                .DeleteActionAsync(actionId, showConfirm: false, CancellationToken.None)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "delete",
                        actionId = result.ActionId ?? actionId,
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
            await EmitErrorAsync(options.Json, "DELETE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionEditAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds).ConfigureAwait(false);
            var result = await session.Proxy
                .EditActionAsync(actionId, CancellationToken.None)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "edit",
                        actionId = result.ActionId ?? actionId,
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
            await EmitErrorAsync(options.Json, "EDIT_FAILED", ex.Message).ConfigureAwait(false);
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

    private static bool TryWriteHelpJson(string[] args)
    {
        if (args.Length < 2)
        {
            return false;
        }

        if (!string.Equals(args[0], "help", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!args.Any(static a => string.Equals(a, "--json", StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        QkrpcCliHelp.WriteJson(global::System.Console.Out);
        return true;
    }

    private static (bool Ok, string? Changelog, string? ErrorCode, string? ErrorMessage) ResolveChangelog(
        ActionOptions options)
    {
        var hasInline = !string.IsNullOrWhiteSpace(options.Changelog);
        var hasFile = !string.IsNullOrWhiteSpace(options.ChangelogFile);

        if (hasInline && hasFile)
        {
            return (false, null, "CONFLICTING_CHANGELOG", "Use either --changelog or --changelog-file, not both.");
        }

        if (!hasFile)
        {
            return (true, options.Changelog, null, null);
        }

        var path = options.ChangelogFile!.Trim();
        if (!File.Exists(path))
        {
            return (false, null, "CHANGELOG_FILE_NOT_FOUND", $"Changelog file not found: {path}");
        }

        try
        {
            var text = File.ReadAllText(path, Encoding.UTF8).TrimEnd();
            return (true, text, null, null);
        }
        catch (Exception ex)
        {
            return (false, null, "CHANGELOG_FILE_READ_FAILED", ex.Message);
        }
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
public sealed class ActionOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "update | search | delete | edit")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Shared action id (GUID).")]
    public string? Id { get; set; }

    [Option("code", HelpText = "Alias for --id.")]
    public string? Code { get; set; }

    [Option("changelog", HelpText = "Optional change log message.")]
    public string? Changelog { get; set; }

    [Option('f', "changelog-file", HelpText = "Read change log from a UTF-8 text file.")]
    public string? ChangelogFile { get; set; }

    [Option('q', "query", HelpText = "Search keyword for action search.")]
    public string? Query { get; set; }

    [Option("limit", Default = 20, HelpText = "Max results for action search (1-100).")]
    public int Limit { get; set; }

    [Option('y', "yes", HelpText = "Required for action delete (skip Quicker confirm dialog).")]
    public bool Yes { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 15, HelpText = "Pipe connect timeout in seconds.")]
    public int TimeoutSeconds { get; set; }
}
