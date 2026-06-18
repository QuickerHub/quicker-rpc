using System;
using System.Collections.Generic;
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
        QkrpcConsoleUtf8.Initialize();

        if (TryWriteHelpJson(args))
        {
            return ExitCodes.Success;
        }

        if (args.Length > 0 && string.Equals(args[0], "agent", StringComparison.OrdinalIgnoreCase))
        {
            return await RunAgentFromArgsAsync(args).ConfigureAwait(false);
        }

        if (args.Length > 0 && string.Equals(args[0], "chrome", StringComparison.OrdinalIgnoreCase))
        {
            return await RunChromeFromArgsAsync(args).ConfigureAwait(false);
        }

        if (args.Length > 0 && string.Equals(args[0], "trigger", StringComparison.OrdinalIgnoreCase))
        {
            return await RunTriggerFromArgsAsync(args).ConfigureAwait(false);
        }

        // CommandLineParser non-generic ParseArguments supports at most 16 verb types.
        var result = Parser.Default.ParseArguments(args,
            typeof(PingOptions),
            typeof(WaitOptions),
            typeof(ServeOptions),
            typeof(McpOptions),
            typeof(ActionOptions),
            typeof(ProfileOptions),
            typeof(ProcessOptions),
            typeof(SubProgramOptions),
            typeof(StepRunnerOptions),
            typeof(FaOptions),
            typeof(GuideOptions),
            typeof(FormOptions),
            typeof(ExprOptions),
            typeof(ScriptOptions),
            typeof(SettingsOptions),
            typeof(LauncherOptions));
        return await result
            .MapResult(
                (object o) => o switch
                {
                    PingOptions opt => RunPingAsync(opt),
                    WaitOptions opt => RunWaitAsync(opt),
                    ServeOptions opt => RunServeAsync(opt),
                    McpOptions opt => RunMcpAsync(opt),
                    ActionOptions opt => RunActionAsync(opt),
                    ProfileOptions opt => RunProfileAsync(opt),
                    ProcessOptions opt => RunProcessAsync(opt),
                    SubProgramOptions opt => RunSubProgramAsync(opt),
                    StepRunnerOptions opt => RunStepRunnerAsync(opt),
                    FaOptions opt => RunFaAsync(opt),
                    GuideOptions opt => RunGuideAsync(opt),
                    FormOptions opt => RunFormAsync(opt),
                    ExprOptions opt => RunExprCommandAsync(opt),
                    ScriptOptions opt => RunScriptCommandAsync(opt),
                    SettingsOptions opt => RunSettingsAsync(opt),
                    LauncherOptions opt => RunLauncherAsync(opt),
                    _ => Task.FromResult(ExitCodes.Error),
                },
                _ => Task.FromResult(ExitCodes.Error))
            .ConfigureAwait(false);
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

    private static async Task<int> RunWaitAsync(WaitOptions options)
    {
        try
        {
            var result = await QuickerRpcClient.WaitForPluginAsync(
                    options.TimeoutSeconds,
                    options.IntervalSeconds,
                    !options.NoBootstrap)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = true,
                        action = "wait",
                        pong = result.Pong,
                        protocolVersion = result.ProtocolVersion,
                        elapsedMs = result.ElapsedMs,
                        attempts = result.Attempts,
                        bootstrapAttempted = result.BootstrapAttempted,
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(
                    $"ready in {result.ElapsedMs}ms ({result.Attempts} attempts, protocol {result.ProtocolVersion})");
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
                    QuickerRpcConnect.BuildConnectTimeoutMessage(
                        QuickerRpcPipeNames.ServerPipe,
                        options.TimeoutSeconds),
                    QuickerRpcConnect.BuildPluginNotRunningHints(bootstrapAttempted: false)))
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "WAIT_FAILED", ex.Message).ConfigureAwait(false);
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
            "validate" => await RunSubProgramProjectValidateAsync(options).ConfigureAwait(false),
            "export" => await RunSubProgramExportAsync(options).ConfigureAwait(false),
            "import" => await RunSubProgramImportAsync(options).ConfigureAwait(false),
            "apply" => await RunSubProgramImportAsync(options).ConfigureAwait(false),
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
            "Use: subprogram create|get|patch|replace|validate|export|import|apply|list|search|edit|edit-var|delete (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    private static Task<int> RunSubProgramSearchAsync(SubProgramOptions options) =>
        RunSubProgramListAsync(options);

    private static async Task<int> RunActionAsync(ActionOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        var sub = (options.SubCommand ?? string.Empty).Trim().ToLowerInvariant();
        if (verb == "library" && sub == "search")
        {
            return await RunActionLibrarySearchAsync(options).ConfigureAwait(false);
        }

        if (verb == "shared" && sub == "get")
        {
            return await RunActionSharedGetAsync(options).ConfigureAwait(false);
        }

        return verb switch
        {
            "update" => await RunActionUpdateAsync(options).ConfigureAwait(false),
            "publish" => await RunActionPublishAsync(options).ConfigureAwait(false),
            "search" => await RunActionSearchAsync(options).ConfigureAwait(false),
            "mention-search" => await RunActionMentionSearchAsync(options).ConfigureAwait(false),
            "list" => await RunActionListAsync(options).ConfigureAwait(false),
            "get" => await RunActionGetAsync(options).ConfigureAwait(false),
            "create" => await RunActionCreateAsync(options).ConfigureAwait(false),
            "patch" => await RunActionPatchAsync(options).ConfigureAwait(false),
            "set-metadata" => await RunActionSetMetadataAsync(options).ConfigureAwait(false),
            "replace" => await RunActionReplaceAsync(options).ConfigureAwait(false),
            "export" => await RunActionExportAsync(options).ConfigureAwait(false),
            "import" => await RunActionImportAsync(options).ConfigureAwait(false),
            "extract" => await RunActionExtractAsync(options).ConfigureAwait(false),
            "apply" => await RunActionApplyAsync(options).ConfigureAwait(false),
            "validate" => await RunActionValidateAsync(options).ConfigureAwait(false),
            "move" => await RunActionMoveAsync(options).ConfigureAwait(false),
            "delete" => await RunActionDeleteAsync(options).ConfigureAwait(false),
            "edit" => await RunActionEditAsync(options).ConfigureAwait(false),
            "run" => await RunActionRunAsync(options).ConfigureAwait(false),
            "runtime-check" => await RunActionRuntimeCheckAsync(options).ConfigureAwait(false),
            "runtime-compile" => await RunActionRuntimeCompileAsync(options).ConfigureAwait(false),
            "runtime-benchmark" => await RunActionRuntimeBenchmarkAsync(options).ConfigureAwait(false),
            "runtime-keys" => await RunActionRuntimeKeysAsync(options).ConfigureAwait(false),
            "mock-profiles" => await RunActionMockProfilesAsync(options).ConfigureAwait(false),
            "mock-trace-diff" => await RunActionMockTraceDiffAsync(options).ConfigureAwait(false),
            "float" => await RunActionFloatAsync(options).ConfigureAwait(false),
            "edit-var" => await RunActionEditVarAsync(options).ConfigureAwait(false),
            "shared-info-get" => await RunActionSharedInfoGetAsync(options).ConfigureAwait(false),
            "shared-info-set" => await RunActionSharedInfoSetAsync(options).ConfigureAwait(false),
            "shared-info-submit-review" => await RunActionSharedInfoSubmitReviewAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownActionVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static async Task<int> ReportUnknownActionVerbAsync(ActionOptions options)
    {
        await EmitErrorAsync(
            options.Json,
            "UNKNOWN_ACTION_VERB",
            "Use: action create|get|patch|set-metadata|replace|extract|apply|validate|export|import|list|search|mention-search|publish|update|library search|shared get|shared-info-get|shared-info-set|shared-info-submit-review|move|delete|edit|run|float|edit-var (see qkrpc help --json)")
            .ConfigureAwait(false);
        return ExitCodes.Error;
    }

    /// <summary>Legacy CLI entry; forwards to <see cref="PublishSharedActionAsync"/> via RPC.</summary>
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

    private static async Task<int> RunActionPublishAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (changelogOk, changelog, changelogErrorCode, changelogErrorMessage) = ResolveChangelog(options);
        if (!changelogOk)
        {
            await EmitErrorAsync(options.Json, changelogErrorCode!, changelogErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (noteOk, note, noteErrorCode, noteErrorMessage) = ResolveShareNote(options);
        if (!noteOk)
        {
            await EmitErrorAsync(options.Json, noteErrorCode!, noteErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (htmlOk, detailHtml, htmlErrorCode, htmlErrorMessage) = await ResolveDetailHtmlAsync(options)
            .ConfigureAwait(false);
        if (!htmlOk)
        {
            await EmitErrorAsync(options.Json, htmlErrorCode!, htmlErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var request = new QuickerRpcActionPublishRequest
        {
            Title = options.Title,
            Description = options.Description,
            Note = note,
            DetailHtml = detailHtml,
            Tags = options.Tags,
            Keywords = options.Keywords,
            ChangeLog = changelog,
            IsPublic = !options.Private,
            SubmitReview = !options.NoSubmitReview,
        };

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            if (options.Preflight)
            {
                var preflight = await session.Proxy
                    .PreflightPublishSharedActionAsync(actionId, request, rpcToken)
                    .ConfigureAwait(false);

                if (options.Json)
                {
                    global::System.Console.WriteLine(JsonSerializer.Serialize(
                        new
                        {
                            ok = preflight.Ready,
                            action = "publish-preflight",
                            ready = preflight.Ready,
                            mode = preflight.Mode,
                            actionId = preflight.ActionId ?? actionId,
                            sharedId = preflight.SharedActionId,
                            title = preflight.Title,
                            description = preflight.Description,
                            icon = preflight.Icon,
                            isPublic = preflight.IsPublic,
                            message = preflight.Message,
                            issues = preflight.Issues,
                        },
                        QkrpcJson.CliOutput));
                }
                else if (preflight.Ready)
                {
                    global::System.Console.WriteLine(preflight.Message);
                }
                else
                {
                    WritePublishIssues(preflight.Issues, preflight.Message);
                }

                return preflight.Ready ? ExitCodes.Success : ExitCodes.Error;
            }

            var result = await session.Proxy
                .PublishSharedActionAsync(actionId, request, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "publish",
                        mode = result.Mode ?? "publish",
                        actionId = result.ActionId ?? actionId,
                        sharedId = result.SharedActionId,
                        shareUrl = result.ShareUrl,
                        revision = result.Revision,
                        isPublic = result.IsPublic,
                        reviewSubmitted = result.ReviewSubmitted,
                        message = result.Message,
                        issues = result.Issues,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(result.Message);
            }
            else
            {
                WritePublishIssues(result.Issues, result.Message);
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
            await EmitErrorAsync(options.Json, "PUBLISH_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static void WritePublishIssues(
        IReadOnlyList<QuickerRpcActionPublishIssue>? issues,
        string? fallbackMessage)
    {
        if (issues is { Count: > 0 })
        {
            foreach (var issue in issues)
            {
                var prefix = string.IsNullOrWhiteSpace(issue.Field) ? issue.Code : issue.Field + ": ";
                global::System.Console.Error.WriteLine(prefix + issue.Message);
            }

            return;
        }

        global::System.Console.Error.WriteLine(
            string.IsNullOrWhiteSpace(fallbackMessage) ? "Publish failed." : fallbackMessage);
    }

    private static Task<int> RunActionSearchAsync(ActionOptions options) =>
        RunActionListAsync(options);

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

    private static async Task<int> RunActionMoveAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "Provide --id or --code <actionId>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var targetProfile = (options.TargetProfile ?? options.ProfileId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(targetProfile))
        {
            await EmitErrorAsync(options.Json, "MISSING_TARGET_PROFILE", "Provide --profile <profileIdOrName>.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if ((options.Row.HasValue && !options.Col.HasValue) || (!options.Row.HasValue && options.Col.HasValue))
        {
            await EmitErrorAsync(options.Json, "MISSING_TARGET_POSITION", "Provide both --row and --col, or neither.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .MoveActionAsync(
                    actionId,
                    targetProfile,
                    options.Row,
                    options.Col,
                    options.Swap,
                    options.OnNoEmptySlot,
                    options.OnOccupiedSlot,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "move",
                        needsUserChoice = result.NeedsUserChoice,
                        conflictReason = result.ConflictReason,
                        choices = result.Choices,
                        actionId = result.ActionId ?? actionId,
                        actionTitle = result.ActionTitle,
                        sourceProfileId = result.SourceProfileId,
                        sourceProfileName = result.SourceProfileName,
                        sourceRow = result.SourceRow,
                        sourceCol = result.SourceCol,
                        targetProfileId = result.TargetProfileId,
                        targetProfileName = result.TargetProfileName,
                        targetRow = result.TargetRow,
                        targetCol = result.TargetCol,
                        swappedActionId = result.SwappedActionId,
                        swappedActionTitle = result.SwappedActionTitle,
                        occupiedActionId = result.OccupiedActionId,
                        occupiedActionTitle = result.OccupiedActionTitle,
                        createdProfile = result.CreatedProfile,
                        createdProfileId = result.CreatedProfileId,
                        createdProfileName = result.CreatedProfileName,
                        reusedProfile = result.ReusedProfile,
                        reusedProfileId = result.ReusedProfileId,
                        reusedProfileName = result.ReusedProfileName,
                        deletedSourceProfile = result.DeletedSourceProfile,
                        deletedSourceProfileId = result.DeletedSourceProfileId,
                        deletedSourceProfileName = result.DeletedSourceProfileName,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(
                    $"{result.Message} actionId={result.ActionId} profile={result.TargetProfileName} ({result.TargetRow},{result.TargetCol})");
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
            await EmitErrorAsync(options.Json, "MOVE_FAILED", ex.Message).ConfigureAwait(false);
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
        if (options.Mock)
        {
            return await RunActionMockAsync(options).ConfigureAwait(false);
        }

        if (options.Standalone)
        {
            return await RunActionStandaloneAsync(options).ConfigureAwait(false);
        }

        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        var hasXAction = !string.IsNullOrWhiteSpace(options.XAction)
                         || !string.IsNullOrWhiteSpace(options.XActionFile);

        if (hasXAction && !string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(
                    options.Json,
                    "CONFLICTING_RUN_TARGET",
                    "Use either --id <actionIdOrName> or --xaction/--xaction-file, not both.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (hasXAction)
        {
            if (!options.Trace)
            {
                await EmitErrorAsync(
                        options.Json,
                        "XACTION_REQUIRES_TRACE",
                        "Inline XAction run requires --trace (ephemeral program trace).")
                    .ConfigureAwait(false);
                return ExitCodes.Error;
            }

            return await RunXActionTraceAsync(options).ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(actionId))
        {
            await EmitErrorAsync(
                    options.Json,
                    "MISSING_ACTION_OR_XACTION",
                    "Provide --id <actionIdOrName> or --xaction/--xaction-file with --trace.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (options.Trace && options.Debug)
        {
            await EmitErrorAsync(
                    options.Json,
                    "CONFLICTING_RUN_MODE",
                    "Use either --trace (plugin terminal trace) or --debug (Quicker step debugger UI), not both.")
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            if (options.Trace)
            {
                return await RunActionTraceAsync(options, actionId).ConfigureAwait(false);
            }

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
                        errorMessage = result.ErrorMessage,
                        stopFlag = result.StopFlag,
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

    private static async Task<int> RunXActionTraceAsync(ActionOptions options)
    {
        var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
            QkrpcJsonPayload.Resolve(options.XAction, options.XActionFile, "xaction");
        if (!jsonOk)
        {
            await EmitErrorAsync(options.Json, jsonErrorCode!, jsonErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (!TryParseJsonObject(jsonText!, "xaction", out var xActionObj, out var parseError))
        {
            await EmitErrorAsync(options.Json, "INVALID_XACTION_JSON", parseError!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        if (!QkrpcPatchPreprocess.TryPreprocessProgram(xActionObj!, options.XActionFile, out var preprocessError))
        {
            await EmitErrorAsync(options.Json, "FORM_SPEC_COMPILE_FAILED", preprocessError!)
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var traceCallbacks = ActionTraceCli.CreateCallbacks(options.Json, options.TraceFile);
            await using var session = await ConnectAsync(
                    options.TimeoutSeconds,
                    !options.NoBootstrap,
                    traceCallbacks)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var progress = new Progress<QuickerRpcActionTraceEvent>(traceEvent =>
            {
                traceCallbacks.OnTraceEvent(traceEvent);
            });
            var xActionJson = xActionObj!.ToString(Newtonsoft.Json.Formatting.None);
            var result = await session.Proxy
                .RunXActionTraceAsync(xActionJson, options.Param, progress, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "trace",
                        actionId = result.ActionId,
                        actionTitle = result.ActionTitle,
                        trace = true,
                        inlineXAction = true,
                        durationMs = result.DurationMs,
                        eventCount = result.EventCount,
                        returnResult = result.ReturnResult,
                        errorMessage = result.ErrorMessage,
                        stopFlag = result.StopFlag,
                        message = result.Message,
                        events = result.Events,
                        failureLocation = result.FailureLocation,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                if (traceCallbacks.StreamedCount == 0)
                {
                    foreach (var traceEvent in result.Events)
                    {
                        ActionTraceCli.WriteTraceEvent(traceEvent, jsonOutput: false, traceCallbacks.ExtraSink);
                    }
                }

                if (!result.Ok)
                {
                    global::System.Console.Error.WriteLine(result.Message);
                }
                else if (!string.IsNullOrWhiteSpace(result.ReturnResult))
                {
                    global::System.Console.WriteLine(result.ReturnResult);
                }
                else
                {
                    global::System.Console.WriteLine(result.Message);
                }
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
            await EmitErrorAsync(options.Json, "TRACE_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionTraceAsync(ActionOptions options, string actionId)
    {
        try
        {
            await using var traceCallbacks = ActionTraceCli.CreateCallbacks(options.Json, options.TraceFile);
            await using var session = await ConnectAsync(
                    options.TimeoutSeconds,
                    !options.NoBootstrap,
                    traceCallbacks)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var progress = new Progress<QuickerRpcActionTraceEvent>(traceEvent =>
            {
                traceCallbacks.OnTraceEvent(traceEvent);
            });
            var result = await session.Proxy
                .RunActionTraceAsync(actionId, options.Param, progress, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "trace",
                        actionId = result.ActionId ?? actionId,
                        actionTitle = result.ActionTitle,
                        trace = true,
                        durationMs = result.DurationMs,
                        eventCount = result.EventCount,
                        returnResult = result.ReturnResult,
                        errorMessage = result.ErrorMessage,
                        stopFlag = result.StopFlag,
                        message = result.Message,
                        events = result.Events,
                        failureLocation = result.FailureLocation,
                    },
                    QkrpcJson.CliOutput));
            }
            else
            {
                if (traceCallbacks.StreamedCount == 0)
                {
                    foreach (var traceEvent in result.Events)
                    {
                        ActionTraceCli.WriteTraceEvent(traceEvent, jsonOutput: false, traceCallbacks.ExtraSink);
                    }
                }

                if (!result.Ok)
                {
                    global::System.Console.Error.WriteLine(result.Message);
                }
                else if (!string.IsNullOrWhiteSpace(result.ReturnResult))
                {
                    global::System.Console.WriteLine(result.ReturnResult);
                }
                else
                {
                    global::System.Console.WriteLine(result.Message);
                }
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
            await EmitErrorAsync(options.Json, "TRACE_FAILED", ex.Message).ConfigureAwait(false);
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

    private static async Task<RpcClientSession> ConnectAsync(int timeoutSeconds, bool tryBootstrap = true) =>
        await ConnectAsync(timeoutSeconds, tryBootstrap, clientRpcTarget: null).ConfigureAwait(false);

    private static async Task<RpcClientSession> ConnectAsync(
        int timeoutSeconds,
        bool tryBootstrap,
        object? clientRpcTarget)
    {
        var (pipe, jsonRpc, proxy) = await QuickerRpcConnect
            .ConnectAsync(timeoutSeconds, tryBootstrap, clientRpcTarget)
            .ConfigureAwait(false);
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

    private static (bool Ok, string? ShareNote, string? ErrorCode, string? ErrorMessage) ResolveShareNote(
        ActionOptions options)
    {
        var hasInline = !string.IsNullOrWhiteSpace(options.ShareNote);
        var hasFile = !string.IsNullOrWhiteSpace(options.NoteFile);

        if (hasInline && hasFile)
        {
            return (false, null, "CONFLICTING_SHARE_NOTE", "Use either --share-note or --note-file, not both.");
        }

        if (!hasFile)
        {
            return (true, options.ShareNote, null, null);
        }

        var path = options.NoteFile!.Trim();
        if (!File.Exists(path))
        {
            return (false, null, "NOTE_FILE_NOT_FOUND", $"Note file not found: {path}");
        }

        try
        {
            var text = File.ReadAllText(path, Encoding.UTF8).TrimEnd();
            return (true, text, null, null);
        }
        catch (Exception ex)
        {
            return (false, null, "NOTE_FILE_READ_FAILED", ex.Message);
        }
    }

    private static async Task<(bool Ok, string? DetailHtml, string? ErrorCode, string? ErrorMessage)>
        ResolveDetailHtmlAsync(ActionOptions options)
    {
        var hasInline = !string.IsNullOrWhiteSpace(options.Html);
        var hasFile = !string.IsNullOrWhiteSpace(options.HtmlFile);

        if (hasInline && hasFile)
        {
            return (false, null, "CONFLICTING_DETAIL_HTML", "Use either --html or --html-file, not both.");
        }

        if (!hasFile)
        {
            return (true, options.Html, null, null);
        }

        var path = options.HtmlFile!.Trim();
        if (!File.Exists(path))
        {
            return (false, null, "HTML_FILE_NOT_FOUND", $"Html file not found: {path}");
        }

        try
        {
            var text = (await File.ReadAllTextAsync(path).ConfigureAwait(false)).TrimEnd();
            return (true, text, null, null);
        }
        catch (Exception ex)
        {
            return (false, null, "HTML_FILE_READ_FAILED", ex.Message);
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

        public JsonRpc JsonRpc => _jsonRpc;

        public async ValueTask DisposeAsync()
        {
            _jsonRpc.Dispose();
            await _pipe.DisposeAsync().ConfigureAwait(false);
        }
    }
}

[Verb("mcp", HelpText = "MCP server over stdio, or install MCP config (alias: qkrpc agent setup).")]
public sealed class McpOptions
{
    [Value(0, MetaName = "command", HelpText = "Optional: install (alias for qkrpc agent setup). Omit to run stdio MCP server.")]
    public string? Command { get; set; }

    [Option("timeout", Default = 120, HelpText = "Default per-tool RPC timeout in seconds (serve mode).")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }

    [Option("check", HelpText = "Install: verify agent-setup.json matches CLI version.")]
    public bool Check { get; set; }

    [Option("upgrade", HelpText = "Install: refresh skills/rules/Claude guidance only (skip MCP).")]
    public bool Upgrade { get; set; }

    [Option("interactive", HelpText = "Install: interactive wizard when no host flags.")]
    public bool Interactive { get; set; }

    [Option("cursor", HelpText = "Install: Cursor plugin (~/.cursor/plugins/local/quicker-rpc).")]
    public bool Cursor { get; set; }

    [Option("claude", HelpText = "Install: write Claude Desktop config")]
    public bool Claude { get; set; }

    [Option("vscode", HelpText = "Install: write VS Code / Copilot user mcp.json")]
    public bool Vscode { get; set; }

    [Option("windsurf", HelpText = "Install: write ~/.codeium/windsurf/mcp_config.json")]
    public bool Windsurf { get; set; }

    [Option("cline", HelpText = "Install: write Cline cline_mcp_settings.json")]
    public bool Cline { get; set; }

    [Option("codex", HelpText = "Install: Codex codex mcp add + optional project AGENTS.md (--project)")]
    public bool Codex { get; set; }

    [Option("all", HelpText = "Install: all supported user-level MCP configs")]
    public bool All { get; set; }

    [Option("project", HelpText = "Install: also write project .cursor/.vscode/.mcp.json in cwd")]
    public bool Project { get; set; }

    [Option("project-skills", HelpText = "Install: with --project, also copy skills to .cursor/skills/")]
    public bool ProjectSkills { get; set; }

    [Option("workspace", HelpText = "Install: QKRPC_WORKSPACE_ROOT (default: current directory)")]
    public string? Workspace { get; set; }

    [Option("skill-source", HelpText = "Install: path to docs/skills root or a single skill directory")]
    public string? SkillSource { get; set; }

    [Option("skip-skill", HelpText = "Install: do not copy skills")]
    public bool SkipSkill { get; set; }

    [Option("cursor-plugin", HelpText = "Install: Cursor plugin (~/.cursor/plugins/local/quicker-rpc)")]
    public bool CursorPlugin { get; set; }

    [Option("codex-plugin", HelpText = "Install: Codex plugin (~/.agents/plugins/quicker-rpc)")]
    public bool CodexPlugin { get; set; }

    [Option("json", HelpText = "Install/check: emit JSON to stdout.")]
    public bool Json { get; set; }
}

[Verb("serve", HelpText = "Run local HTTP API with a persistent Quicker RPC connection (for agent-gui).")]
public sealed class ServeOptions
{
    [Value(0, MetaName = "command", HelpText = "Optional: openapi (export OpenAPI JSON). Omit to run HTTP server.")]
    public string? Command { get; set; }

    [Option("json", HelpText = "openapi: write JSON to stdout.")]
    public bool Json { get; set; }

    [Option("out", HelpText = "openapi: write JSON to file path.")]
    public string? Out { get; set; }

    [Option("host", Default = "127.0.0.1", HelpText = "Bind address (loopback only).")]
    public string? Host { get; set; }

    [Option("port", Default = 9477, HelpText = "HTTP port (/health, /v1/invoke, /openapi.json).")]
    public int Port { get; set; }

    [Option("timeout", Default = 120, HelpText = "Default per-request RPC timeout in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
}

[Verb("wait", HelpText = "Poll until QuickerRpc plugin is reachable (or timeout).")]
public sealed class WaitOptions
{
    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }

    [Option("timeout", Default = 120, HelpText = "Max wait in seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("interval", Default = 2, HelpText = "Poll interval in seconds between attempts.")]
    public int IntervalSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Do not auto-start plugin via quicker:runaction when pipe is unavailable.")]
    public bool NoBootstrap { get; set; }
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
    [Value(0, MetaName = "command", Required = true, HelpText = "create | get | patch | library | shared | ... (see qkrpc help action)")]
    public string? Command { get; set; }

    [Value(1, MetaName = "subcommand", HelpText = "For library: search. For shared: get.")]
    public string? SubCommand { get; set; }

    [Option("id", HelpText = "Action id (GUID). publish/update: local or shared id.")]
    public string? Id { get; set; }

    [Option("code", HelpText = "Alias for --id.")]
    public string? Code { get; set; }

    [Option("changelog", HelpText = "Optional change log message.")]
    public string? Changelog { get; set; }

    [Option('f', "changelog-file", HelpText = "Read change log from a UTF-8 text file.")]
    public string? ChangelogFile { get; set; }

    [Option("share-note", HelpText = "Share page intro (Note) markdown for action publish.")]
    public string? ShareNote { get; set; }

    [Option("note-file", HelpText = "Read share page intro (Note) from a UTF-8 markdown file.")]
    public string? NoteFile { get; set; }

    [Option("html", HelpText = "Action page intro HTML (getquicker 动作说明 Detail) for shared-info-set / publish.")]
    public string? Html { get; set; }

    [Option("html-file", HelpText = "Read HTML for action shared-info-set from a UTF-8 file.")]
    public string? HtmlFile { get; set; }

    [Option("tags", HelpText = "Comma-separated predefined getquicker categories for action publish (free-form tags are rejected).")]
    public string? Tags { get; set; }

    [Option("keywords", HelpText = "Keywords for action publish.")]
    public string? Keywords { get; set; }

    [Option("private", HelpText = "Non-public share (action publish only).")]
    public bool Private { get; set; }

    [Option("no-submit-review", HelpText = "Do not auto-submit public action for review (action publish).")]
    public bool NoSubmitReview { get; set; }

    [Option("preflight", HelpText = "Validate publish/update prerequisites without uploading (action publish only).")]
    public bool Preflight { get; set; }

    [Option("keyword", HelpText = "Keyword for action library search (getquicker.net).")]
    public string? Keyword { get; set; }

    [Option("page", Default = 1, HelpText = "Page number for action library search (1-based).")]
    public int Page { get; set; }

    [Option("days", HelpText = "Time filter for library search: 7 | 30 | 90 | 365.")]
    public int? Days { get; set; }

    [Option('q', "query", HelpText = "Plain keyword, legacy prefix (source:library|uses:Sub), or JSON query with filter/sort scripts.")]
    public string? Query { get; set; }

    [Option("query-file", HelpText = "Read --query JSON/text from a UTF-8 file.")]
    public string? QueryFile { get; set; }

    [Option("filter", HelpText = "Install source filter for list/search: library|installed|local|published.")]
    public string? Filter { get; set; }

    [Option("scope", HelpText = "Limit to process/scene: chrome, global, common, default, taskbar, desktop, agent, profile id/name.")]
    public string? Scope { get; set; }

    [Option("limit", Default = 20, HelpText = "Max results for action search/list (1-200).")]
    public int Limit { get; set; }

    [Option("sort", HelpText = "action list: relevance | lastEdit (default when no --query) | title.")]
    public string? Sort { get; set; }

    [Option("fields", HelpText = "action list: comma-separated output fields (e.g. actionId,title,profileName) or * for all. JSON query may also set fields/select/columns.")]
    public string? Fields { get; set; }

    [Option("title", HelpText = "Title for action create.")]
    public string? Title { get; set; }

    [Option("description", HelpText = "Description for action create.")]
    public string? Description { get; set; }

    [Option("icon", HelpText = "Icon: fa:Light_Name[:#color] or absolute http(s) image URL.")]
    public string? Icon { get; set; }

    [Option("context-menu-data", HelpText = "Action context menu definition (CommonOperationItem lines; \"\" clears).")]
    public string? ContextMenuData { get; set; }

    [Option("profile-id", HelpText = "Optional virtual action page id for action create.")]
    public string? ProfileId { get; set; }

    [Option("profile", HelpText = "Target profile id/name/scope for action move.")]
    public string? TargetProfile { get; set; }

    [Option("row", HelpText = "Target row for action move.")]
    public int? Row { get; set; }

    [Option("col", HelpText = "Target column for action move.")]
    public int? Col { get; set; }

    [Option("swap", HelpText = "Allow action move to swap with an occupied target position.")]
    public bool Swap { get; set; }

    [Option("on-no-empty-slot", HelpText = "When target page has no empty slot: ask (default) | cancel | create-page-after.")]
    public string? OnNoEmptySlot { get; set; }

    [Option("on-occupied-slot", HelpText = "When target row/col is occupied: ask (default) | cancel | swap.")]
    public string? OnOccupiedSlot { get; set; }

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

    [Option("dir", HelpText = "Local .quicker project directory (extract/apply default: .quicker/actions/{actionId}).")]
    public string? Dir { get; set; }

    [Option("min-lines", Default = 4, HelpText = "For extract: externalize value strings with more than N lines.")]
    public int MinLines { get; set; }

    [Option("no-auto-files", HelpText = "For extract: disable auto file refs for long inline values.")]
    public bool NoAutoFiles { get; set; }

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

    [Option("trace", HelpText = "Trace run: plugin XActionRunner debug log to stdout (UTF-8). Implies wait.")]
    public bool Trace { get; set; }

    [Option("trace-file", HelpText = "Also write human-readable trace lines to a UTF-8 file (avoids PowerShell redirect encoding issues).")]
    public string? TraceFile { get; set; }

    [Option("standalone", HelpText = "Run via Quicker.ActionRuntime (no Quicker process or RPC pipe).")]
    public bool Standalone { get; set; }

    [Option("mock", HelpText = "Run via ActionRuntime with deterministic mocks (benchmark verify).")]
    public bool Mock { get; set; }

    [Option("mock-profile", HelpText = "Mock profile id (agent-gui/benchmarks/mock-profiles/<id>.json).")]
    public string? MockProfile { get; set; }

    [Option("mock-profile-file", HelpText = "Explicit mock profile JSON file path.")]
    public string? MockProfileFile { get; set; }

    [Option("assert", HelpText = "Evaluate mock profile assertions (default when profile has assertions).")]
    public bool Assert { get; set; }

    [Option("package-file", HelpText = "ActionExecutionPackage JSON for standalone run/check/compile.")]
    public string? PackageFile { get; set; }

    [Option("compressed-file", HelpText = "Quicker compressed XAction JSON (shared get / action get wire format).")]
    public string? CompressedFile { get; set; }

    [Option("out", HelpText = "runtime-compile: write csharpScript to UTF-8 file.")]
    public string? Out { get; set; }

    [Option("script-out", HelpText = "runtime-compile: write intermediate JavaScript to UTF-8 file.")]
    public string? ScriptOut { get; set; }

    [Option("warmup", Default = 0, HelpText = "runtime-benchmark: warmup iterations before timing (default 3).")]
    public int BenchmarkWarmup { get; set; }

    [Option("iterations", Default = 0, HelpText = "runtime-benchmark: measurement iterations (default 20).")]
    public int BenchmarkIterations { get; set; }

    [Option("benchmark-force-gc", HelpText = "runtime-benchmark: force GC between JSON and C# timing.")]
    public bool BenchmarkForceGc { get; set; }

    [Option("verbose-host", HelpText = "Standalone: log IHostServices callbacks to stdout/stderr.")]
    public bool VerboseHost { get; set; }

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

    [Option("icon", HelpText = "Icon: fa:Light_Name[:#color] or absolute http(s) image URL.")]
    public string? Icon { get; set; }

    [Option('q', "query", HelpText = "Keyword or prefix query for subprogram search/list: uses:<idOrName> | uses-only:<idOrName> | source:published|local | shared:<sharedId>.")]
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
    [Value(0, MetaName = "command", Required = true, HelpText = "search | get | get-ui | summaries")]
    public string? Command { get; set; }

    [Option('q', "query", HelpText = "Search keyword for step-runner search.")]
    public string? Query { get; set; }

    [Option("key", HelpText = "StepRunner key for step-runner get.")]
    public string? Key { get; set; }

    [Option("control-field", HelpText = "Control-field value for step-runner get (e.g. move_ex on sys:windowOperations).")]
    public string? ControlField { get; set; }

    [Option("limit", Default = 40, HelpText = "Max results for step-runner search.")]
    public int Limit { get; set; }

    [Option("request-file", HelpText = "JSON request file for step-runner summaries ({ steps, subProgramsJson? }).")]
    public string? RequestFile { get; set; }

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
    [Value(0, MetaName = "command", Required = true, HelpText = "search | resolve")]
    public string? Command { get; set; }

    [Option("spec", HelpText = "Single fa: spec for fa resolve (e.g. fa:Light_Flask).")]
    public string? Spec { get; set; }

    [Option("specs", HelpText = "JSON array of fa: specs for fa resolve (batch).")]
    public string? Specs { get; set; }

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

    [Option("reference", HelpText = "Reference id under topic for guide get (e.g. chromecontrol, examples/http).")]
    public string? Reference { get; set; }

    [Option('q', "query", HelpText = "Keyword for guide search.")]
    public string? Query { get; set; }

    [Option("limit", Default = 10, HelpText = "Max results for guide search.")]
    public int Limit { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }
}

[Verb("form", HelpText = "Validate and compile qkrpc.form.v1 multi-field form specs for sys:form.")]
public sealed class FormOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "validate | build")]
    public string? Command { get; set; }

    [Option("spec", HelpText = "Inline form spec JSON.")]
    public string? Spec { get; set; }

    [Option("file", HelpText = "Form spec JSON file path, or - for stdin.")]
    public string? File { get; set; }

    [Option("json", HelpText = "Emit JSON for automation.")]
    public bool Json { get; set; }
}
