using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CommandLine;
using QuickerRpc.Contracts.Rpc;
using StreamJsonRpc;

namespace QuickerRpc.Console;

/// <summary>Exit codes for scripting.</summary>
public static class ExitCodes
{
    public const int Success = 0;
    public const int Error = 1;
}

internal static partial class Program
{
    private static async Task<int> Main(string[] args)
    {
        ConfigureConsoleUtf8();

        if (TryWriteHelpJson(args))
        {
            return ExitCodes.Success;
        }

        var result = Parser.Default.ParseArguments<
            PingOptions,
            ActionOptions,
            SubProgramOptions,
            StepRunnerOptions,
            FaOptions,
            GuideOptions>(args);
        return await result
            .MapResult(
                (PingOptions o) => RunPingAsync(o),
                (ActionOptions o) => RunActionAsync(o),
                (SubProgramOptions o) => RunSubProgramAsync(o),
                (StepRunnerOptions o) => RunStepRunnerAsync(o),
                (FaOptions o) => RunFaAsync(o),
                (GuideOptions o) => RunGuideAsync(o),
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var pong = await session.Proxy.PingAsync(rpcToken).ConfigureAwait(false);
            var version = await session.Proxy.GetProtocolVersionAsync(rpcToken).ConfigureAwait(false);

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
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine($"pong (protocol {version}, pipe {QuickerRpcPipeNames.ServerPipe})");
            }

            return ExitCodes.Success;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitConnectErrorAsync(
                options.Json,
                new QuickerRpcClientException(
                    QuickerRpcConnect.ConnectTimeoutErrorCode,
                    QuickerRpcConnect.BuildConnectTimeoutMessage(QuickerRpcPipeNames.ServerPipe, options.TimeoutSeconds),
                    QuickerRpcConnect.BuildPluginNotRunningHints(bootstrapAttempted: false)))
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "PING_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunSubProgramAsync(SubProgramOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => await RunSubProgramSearchAsync(options).ConfigureAwait(false),
            "list" => await RunSubProgramListAsync(options).ConfigureAwait(false),
            "create" => await RunSubProgramCreateAsync(options).ConfigureAwait(false),
            "get" => await RunSubProgramGetAsync(options).ConfigureAwait(false),
            "patch" => await RunSubProgramPatchAsync(options).ConfigureAwait(false),
            "replace" => await RunSubProgramReplaceAsync(options).ConfigureAwait(false),
            "export" => await RunSubProgramExportAsync(options).ConfigureAwait(false),
            "import" => await RunSubProgramImportAsync(options).ConfigureAwait(false),
            "edit" => await RunSubProgramEditAsync(options).ConfigureAwait(false),
            "delete" => await RunSubProgramDeleteAsync(options).ConfigureAwait(false),
            "edit-var" => await RunSubProgramEditVarAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownSubProgramVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownSubProgramVerbAsync(SubProgramOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_SUBPROGRAM_VERB",
            "Use: subprogram create|get|patch|replace|export|import|list|search|edit|edit-var|delete (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static async Task<int> RunSubProgramSearchAsync(SubProgramOptions options)
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .SearchGlobalSubProgramsAsync(query, options.Limit, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "subprogram-search",
                        query,
                        count = result.Items.Count,
                        items = result.Items,
                        message = string.IsNullOrWhiteSpace(result.Message) ? null : result.Message,
                    },
                    QkrpcJson.CliOutput));
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
                        global::System.Console.WriteLine($"{item.Id}\t{item.Name}\t{item.Description}");
                    }
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "SUBPROGRAM_SEARCH_FAILED", ex.Message).ConfigureAwait(false);
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
            "list" => await RunActionListAsync(options).ConfigureAwait(false),
            "get" => await RunActionGetAsync(options).ConfigureAwait(false),
            "create" => await RunActionCreateAsync(options).ConfigureAwait(false),
            "patch" => await RunActionPatchAsync(options).ConfigureAwait(false),
            "set-metadata" => await RunActionSetMetadataAsync(options).ConfigureAwait(false),
            "replace" => await RunActionReplaceAsync(options).ConfigureAwait(false),
            "export" => await RunActionExportAsync(options).ConfigureAwait(false),
            "import" => await RunActionImportAsync(options).ConfigureAwait(false),
            "delete" => await RunActionDeleteAsync(options).ConfigureAwait(false),
            "edit" => await RunActionEditAsync(options).ConfigureAwait(false),
            "run" => await RunActionRunAsync(options).ConfigureAwait(false),
            "float" => await RunActionFloatAsync(options).ConfigureAwait(false),
            "edit-var" => await RunActionEditVarAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownActionVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownActionVerbAsync(ActionOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_ACTION_VERB",
            "Use: action create|get|patch|set-metadata|replace|export|import|list|search|update|delete|edit|run|float|edit-var (see qkrpc help --json)")
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .UpdateSharedActionAsync(actionId, changelog, rpcToken)
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
                    },
                    QkrpcJson.CliOutput));
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
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .SearchActionsAsync(query, options.Limit, options.Scope, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "search",
                        query,
                        scope = result.Scope,
                        count = result.Items.Count,
                        items = result.Items,
                        message = string.IsNullOrWhiteSpace(result.Message) ? null : result.Message,
                    },
                    QkrpcJson.CliOutput));
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
                        global::System.Console.WriteLine(
                            $"{item.Id}\t{item.Title}\t{item.ExeFile}\t{item.ProfileName ?? item.PageTitle}");
                    }
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .DeleteActionAsync(actionId, showConfirm: false, rpcToken)
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
                    },
                    QkrpcJson.CliOutput));
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
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "DELETE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionEditVarAsync(ActionOptions options)
    {
        var targetIdOrName = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(targetIdOrName))
        {
            await EmitErrorAsync(options.Json, "MISSING_TARGET_ID", "Provide --id or --code <subProgramIdOrName|actionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var variableKey = (options.Variable ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(variableKey))
        {
            await EmitErrorAsync(options.Json, "MISSING_VARIABLE", "Provide --var <variableKey> (e.g. version).")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (options.Value is null)
        {
            await EmitErrorAsync(options.Json, "MISSING_VALUE", "Provide --value <defaultValue>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .EditGlobalSubProgramVariableAsync(targetIdOrName, variableKey, options.Value, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "edit-var",
                        targetKind = result.TargetKind,
                        targetId = result.SubProgramIdOrName ?? targetIdOrName,
                        subProgramIdOrName = result.SubProgramIdOrName ?? targetIdOrName,
                        variableKey = result.VariableKey ?? variableKey,
                        oldValue = result.OldValue,
                        newValue = result.NewValue ?? options.Value,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
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
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "EDIT_VAR_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionFloatAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionIdOrName>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.FloatActionAsync(actionId, rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "float",
                        actionId = result.ActionId ?? actionId,
                        actionTitle = result.ActionTitle,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
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
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "FLOAT_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionRunAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionIdOrName>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .RunActionAsync(actionId, options.Param, options.Debug, options.Wait, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "run",
                        actionId = result.ActionId ?? actionId,
                        actionTitle = result.ActionTitle,
                        debug = options.Debug,
                        wait = options.Wait,
                        returnResult = result.ReturnResult,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                if (!string.IsNullOrWhiteSpace(result.ReturnResult))
                {
                    global::System.Console.WriteLine(result.ReturnResult);
                }
                else
                {
                    global::System.Console.WriteLine(result.Message);
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "RUN_FAILED", ex.Message).ConfigureAwait(false);
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
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .EditActionAsync(actionId, rpcToken)
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
                    },
                    QkrpcJson.CliOutput));
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
        catch (QuickerRpcClientException ex)
        {
            await EmitConnectErrorAsync(options.Json, ex).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (OperationCanceledException)
        {
            await EmitRpcTimeoutAsync(options.Json, options.TimeoutSeconds).ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "EDIT_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<RpcClientSession> ConnectAsync(int timeoutSeconds, bool tryBootstrap = true)
    {
        var (pipe, jsonRpc, proxy) = await QuickerRpcConnect.ConnectAsync(timeoutSeconds, tryBootstrap).ConfigureAwait(false);
        return new RpcClientSession(pipe, jsonRpc, proxy);
    }

    private static Task EmitConnectErrorAsync(bool json, QuickerRpcClientException ex)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = false,
                    error = ex.ErrorCode,
                    message = ex.Message,
                    hints = ex.Hints,
                    pipe = QuickerRpcPipeNames.ServerPipe,
                },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.Error.WriteLine(ex.Message);
            foreach (var hint in ex.Hints)
            {
                global::System.Console.Error.WriteLine($"  - {hint}");
            }
        }

        return Task.CompletedTask;
    }

    private static Task EmitRpcTimeoutAsync(bool json, int timeoutSeconds)
    {
        var message =
            $"RPC 调用超时（{timeoutSeconds}s）。Quicker 可能繁忙，或插件无响应。" + Environment.NewLine +
            "请重试：qkrpc ping --json";

        return EmitErrorAsync(json, "RPC_TIMEOUT", message);
    }

    private static Task EmitErrorAsync(bool json, string code, string message)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = false, error = code, message },
                QkrpcJson.CliOutput));
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

    [Option("timeout", Default = 10, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("action", HelpText = "Quicker action operations via RPC.")]
public sealed class ActionOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "create | get | patch | replace | export | import | list | search | update | delete | edit | run | float | edit-var")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Shared action id (GUID).")]
    public string? Id { get; set; }

    [Option("code", HelpText = "Alias for --id.")]
    public string? Code { get; set; }

    [Option("changelog", HelpText = "Optional change log message.")]
    public string? Changelog { get; set; }

    [Option('f', "changelog-file", HelpText = "Read change log from a UTF-8 text file.")]
    public string? ChangelogFile { get; set; }

    [Option('q', "query", HelpText = "Search keyword for action search/list.")]
    public string? Query { get; set; }

    [Option("scope", HelpText = "Limit to process/scene: chrome, global, common, default, taskbar, desktop, agent, profile id/name.")]
    public string? Scope { get; set; }

    [Option("limit", Default = 20, HelpText = "Max results for action search/list (1-200).")]
    public int Limit { get; set; }

    [Option("title", HelpText = "Title for action create.")]
    public string? Title { get; set; }

    [Option("description", HelpText = "Description for action create.")]
    public string? Description { get; set; }

    [Option("icon", HelpText = "Icon for action create (e.g. fa:IconName).")]
    public string? Icon { get; set; }

    [Option("profile-id", HelpText = "Optional virtual action page id for action create.")]
    public string? ProfileId { get; set; }

    [Option("return-mode", HelpText = "For action get: full | structure | metadata.")]
    public string? ReturnMode { get; set; }

    [Option("patch", HelpText = "Inline JSON patch object for action patch.")]
    public string? Patch { get; set; }

    [Option("patch-file", HelpText = "Patch JSON file path, or - for stdin.")]
    public string? PatchFile { get; set; }

    [Option("xaction", HelpText = "Inline XAction JSON for action replace.")]
    public string? XAction { get; set; }

    [Option("xaction-file", HelpText = "XAction JSON file path, or - for stdin.")]
    public string? XActionFile { get; set; }

    [Option("dir", HelpText = "Local .quicker project directory for export/import.")]
    public string? Dir { get; set; }

    [Option("expected-edit-version", HelpText = "Edit version from action get (optimistic concurrency).")]
    public long? ExpectedEditVersion { get; set; }

    [Option("force", HelpText = "Skip edit version check for patch/replace.")]
    public bool Force { get; set; }

    [Option('y', "yes", HelpText = "Required for action delete (skip Quicker confirm dialog).")]
    public bool Yes { get; set; }

    [Option("var", HelpText = "Variable key for action edit-var (e.g. version).")]
    public string? Variable { get; set; }

    [Option("value", HelpText = "New default value for action edit-var.")]
    public string? Value { get; set; }

    [Option('p', "param", HelpText = "Input parameter for action run.")]
    public string? Param { get; set; }

    [Option("debug", HelpText = "Debug run: open Quicker step debugger (enableDebugging).")]
    public bool Debug { get; set; }

    [Option("wait", HelpText = "Wait for action completion and return ReturnResult.")]
    public bool Wait { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 10, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("subprogram", HelpText = "Global (public) subprogram operations via RPC.")]
public sealed class SubProgramOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "create | get | patch | replace | export | import | list | search | edit | edit-var | delete")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Global subprogram id or name.")]
    public string? Id { get; set; }

    [Option("code", HelpText = "Alias for --id.")]
    public string? Code { get; set; }

    [Option("name", HelpText = "Subprogram name for create.")]
    public string? Name { get; set; }

    [Option("title", HelpText = "Alias for --name on create.")]
    public string? Title { get; set; }

    [Option("description", HelpText = "Description for create.")]
    public string? Description { get; set; }

    [Option("icon", HelpText = "Icon for create (e.g. fa:IconName).")]
    public string? Icon { get; set; }

    [Option('q', "query", HelpText = "Search keyword for subprogram search/list.")]
    public string? Query { get; set; }

    [Option("limit", Default = 20, HelpText = "Max results for subprogram search/list (1-100).")]
    public int Limit { get; set; }

    [Option("return-mode", HelpText = "For subprogram get: full | structure | metadata.")]
    public string? ReturnMode { get; set; }

    [Option("patch", HelpText = "Inline JSON patch for subprogram patch.")]
    public string? Patch { get; set; }

    [Option("patch-file", HelpText = "Patch JSON file path, or - for stdin.")]
    public string? PatchFile { get; set; }

    [Option("program", HelpText = "Inline program JSON for subprogram replace.")]
    public string? Program { get; set; }

    [Option("program-file", HelpText = "Program JSON file path, or - for stdin.")]
    public string? ProgramFile { get; set; }

    [Option("dir", HelpText = "Local .quicker project directory for export/import.")]
    public string? Dir { get; set; }

    [Option("expected-edit-version", HelpText = "Edit version from subprogram get.")]
    public long? ExpectedEditVersion { get; set; }

    [Option("force", HelpText = "Skip edit version check for patch/replace.")]
    public bool Force { get; set; }

    [Option("var", HelpText = "Variable key for subprogram edit-var.")]
    public string? Variable { get; set; }

    [Option("value", HelpText = "New default value for subprogram edit-var.")]
    public string? Value { get; set; }

    [Option('y', "yes", HelpText = "Required for subprogram delete.")]
    public bool Yes { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 10, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("step-runner", HelpText = "StepRunner catalog for headless XAction authoring.")]
public sealed class StepRunnerOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "search | get")]
    public string? Command { get; set; }

    [Option('q', "query", HelpText = "Search keyword for step-runner search.")]
    public string? Query { get; set; }

    [Option("key", HelpText = "StepRunner key for step-runner get.")]
    public string? Key { get; set; }

    [Option("control-field", HelpText = "Control-field value for step-runner get (e.g. move_ex on sys:windowOperations).")]
    public string? ControlField { get; set; }

    [Option("limit", Default = 40, HelpText = "Max results for step-runner search.")]
    public int Limit { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 30, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("fa", HelpText = "Font Awesome icon search (names[]; write fa:{name} or fa:{name}:{#color}).")]
public sealed class FaOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "search")]
    public string? Command { get; set; }

    [Option('q', "query", HelpText = "Search keyword (name, label, or fa: spec). Empty lists catalog head.")]
    public string? Query { get; set; }

    [Option("limit", Default = 40, HelpText = "Max results for fa search.")]
    public int Limit { get; set; }

    [Option("expand", HelpText = "Do not compress: full enum names, all style variants (Solid/Regular/Light).")]
    public bool Expand { get; set; }

    [Option("all-styles", HelpText = "Alias for --expand.")]
    public bool AllStyles { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 10, HelpText = "Pipe connect and RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("guide", HelpText = "Embedded ActionAuthoring docs (no Quicker connection required).")]
public sealed class GuideOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "get | search")]
    public string? Command { get; set; }

    [Option("topic", HelpText = "Topic id for guide get (e.g. overview, patch-workflow).")]
    public string? Topic { get; set; }

    [Option('q', "query", HelpText = "Keyword for guide search.")]
    public string? Query { get; set; }

    [Option("limit", Default = 10, HelpText = "Max results for guide search.")]
    public int Limit { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }
}
