using System.Text.Json;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal static class ServeInvokeDispatcher
{
    private static readonly ActionAuthoringGuideService Guides = new();

    public static async Task<ServeInvokeResponse> InvokeAsync(
        QkrpcRpcSessionPool pool,
        string op,
        JsonElement args,
        int timeoutSeconds,
        CancellationToken cancellationToken)
    {
        var normalized = (op ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(normalized))
        {
            return Fail("MISSING_OP", "Provide op (e.g. ping, action.list).");
        }

        try
        {
            return normalized switch
            {
                "ping" => await PingAsync(pool, timeoutSeconds, cancellationToken).ConfigureAwait(false),
                "guide.get" => GuideGet(args),
                "guide.search" => GuideSearch(args),
                _ when normalized.StartsWith("guide.", StringComparison.Ordinal) =>
                    Fail("UNKNOWN_OP", $"Unknown guide op: {op}"),
                _ => await RpcOpAsync(pool, normalized, args, timeoutSeconds, cancellationToken)
                    .ConfigureAwait(false),
            };
        }
        catch (QuickerRpcClientException ex)
        {
            await pool.InvalidateAsync().ConfigureAwait(false);
            return Fail(ex.ErrorCode, ex.Message);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            await pool.InvalidateAsync().ConfigureAwait(false);
            return Fail("RPC_TIMEOUT", $"RPC timed out after {timeoutSeconds}s.");
        }
        catch (Exception ex)
        {
            await pool.InvalidateAsync().ConfigureAwait(false);
            return Fail("INVOKE_FAILED", ex.Message);
        }
    }

    private static async Task<ServeInvokeResponse> RpcOpAsync(
        QkrpcRpcSessionPool pool,
        string op,
        JsonElement args,
        int timeoutSeconds,
        CancellationToken cancellationToken)
    {
        var rpc = await pool.GetRpcAsync(cancellationToken).ConfigureAwait(false);
        var token = QuickerRpcClient.CreateRpcCancellationToken(timeoutSeconds);

        return op switch
        {
            "action.list" => await ActionListAsync(pool, args, token).ConfigureAwait(false),
            "action.search" => await ActionSearchAsync(pool, args, token).ConfigureAwait(false),
            "action.get" => await ActionGetAsync(rpc, args, token).ConfigureAwait(false),
            "action.create" => await ActionCreateAsync(rpc, args, token).ConfigureAwait(false),
            "action.patch" => await ActionPatchAsync(rpc, args, token).ConfigureAwait(false),
            "action.replace" => await ActionReplaceAsync(rpc, args, token).ConfigureAwait(false),
            "action.set-metadata" => await ActionSetMetadataAsync(rpc, args, token).ConfigureAwait(false),
            "action.update" => await ActionUpdateAsync(rpc, args, token).ConfigureAwait(false),
            "action.delete" => await ActionDeleteAsync(rpc, args, token).ConfigureAwait(false),
            "action.run" => await ActionRunAsync(rpc, args, token).ConfigureAwait(false),
            "action.float" => await ActionFloatAsync(rpc, args, token).ConfigureAwait(false),
            "action.edit" => await ActionEditAsync(rpc, args, token).ConfigureAwait(false),
            "action.edit-var" => await ActionEditVarAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.search" => await SubprogramSearchAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.list" => await SubprogramListAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.create" => await SubprogramCreateAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.get" => await SubprogramGetAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.patch" => await SubprogramPatchAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.replace" => await SubprogramReplaceAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.edit" => await SubprogramEditAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.edit-var" => await SubprogramEditVarAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.delete" => await SubprogramDeleteAsync(rpc, args, token).ConfigureAwait(false),
            "step-runner.search" => await StepRunnerSearchAsync(rpc, args, token).ConfigureAwait(false),
            "step-runner.get" => await StepRunnerGetAsync(rpc, args, token).ConfigureAwait(false),
            "fa.search" => await FaSearchAsync(rpc, args, token).ConfigureAwait(false),
            "fa.resolve" => await FaResolveAsync(rpc, args, token).ConfigureAwait(false),
            _ => Fail("UNKNOWN_OP", $"Unknown op: {op}"),
        };
    }

    private static async Task<ServeInvokeResponse> PingAsync(
        QkrpcRpcSessionPool pool,
        int timeoutSeconds,
        CancellationToken cancellationToken)
    {
        var rpc = await pool.GetRpcAsync(cancellationToken).ConfigureAwait(false);
        var token = QuickerRpcClient.CreateRpcCancellationToken(timeoutSeconds);
        var pong = await rpc.PingAsync(token).ConfigureAwait(false);
        var version = await rpc.GetProtocolVersionAsync(token).ConfigureAwait(false);
        return Ok(new
        {
            ok = true,
            action = "ping",
            pong,
            protocolVersion = version,
            pipe = QuickerRpcPipeNames.ServerPipe,
        });
    }

    private static ServeInvokeResponse GuideGet(JsonElement args)
    {
        var topic = ServeJsonArgs.GetString(args, "topic") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(topic))
        {
            return Fail("MISSING_TOPIC", "args.topic is required.");
        }

        var response = Guides.GetDoc(topic);
        return Ok(new
        {
            ok = response.Success,
            action = "guide-get",
            success = response.Success,
            errorMessage = response.ErrorMessage,
            topic = response.Topic,
            title = response.Title,
            markdown = response.Markdown,
            availableTopics = response.AvailableTopics,
        });
    }

    private static ServeInvokeResponse GuideSearch(JsonElement args)
    {
        var response = Guides.Search(
            ServeJsonArgs.GetString(args, "query"),
            ServeJsonArgs.GetInt(args, "limit"));
        return Ok(new
        {
            ok = response.Success,
            action = "guide-search",
            success = response.Success,
            keyword = response.Keyword,
            matchCount = response.MatchCount,
            items = response.Items,
            availableTopics = response.AvailableTopics,
        });
    }

    private static async Task<ServeInvokeResponse> ActionListAsync(
        QkrpcRpcSessionPool pool,
        JsonElement args,
        CancellationToken token)
    {
        var query = ServeJsonArgs.GetString(args, "query");
        var scope = ServeJsonArgs.GetString(args, "scope");
        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 30;
        var sort = ServeJsonArgs.GetString(args, "sort");
        var queryTrimmed = string.IsNullOrWhiteSpace(query) ? null : query.Trim();
        var session = await pool.GetSessionAsync(token).ConfigureAwait(false);
        var response = await QuickerRpcActionListCompat
            .ListAsync(session, queryTrimmed, limit, scope, sort, token)
            .ConfigureAwait(false);
        if (ShouldRetryActionQueryAfterReconnect(queryTrimmed, response.Success, response.MatchCount))
        {
            await pool.InvalidateAsync().ConfigureAwait(false);
            session = await pool.GetSessionAsync(token).ConfigureAwait(false);
            response = await QuickerRpcActionListCompat
                .ListAsync(session, queryTrimmed, limit, scope, sort, token)
                .ConfigureAwait(false);
        }

        var payloadNode = AgentApiListJson.ToPayload(response);
        return Ok(new { ok = response.Success, action = "list", payload = payloadNode });
    }

    private static async Task<ServeInvokeResponse> ActionSearchAsync(
        QkrpcRpcSessionPool pool,
        JsonElement args,
        CancellationToken token)
    {
        var query = ServeJsonArgs.GetString(args, "query") ?? string.Empty;
        var queryTrimmed = query.Trim();
        if (string.IsNullOrWhiteSpace(queryTrimmed))
        {
            return await ActionListAsync(
                pool,
                args,
                token).ConfigureAwait(false);
        }

        var scope = ServeJsonArgs.GetString(args, "scope");
        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 20;
        var rpc = await pool.GetRpcAsync(token).ConfigureAwait(false);
        var response = await rpc.SearchActionsAsync(queryTrimmed, limit, scope, token).ConfigureAwait(false);
        if (ShouldRetryActionQueryAfterReconnect(queryTrimmed, response.Ok, response.Items.Count))
        {
            await pool.InvalidateAsync().ConfigureAwait(false);
            rpc = await pool.GetRpcAsync(token).ConfigureAwait(false);
            response = await rpc.SearchActionsAsync(queryTrimmed, limit, scope, token).ConfigureAwait(false);
        }

        return Ok(new { ok = response.Ok, action = "search", items = response.Items, message = response.Message });
    }

    /// <summary>Reconnect once after plugin reload — stale serve sessions may miss pinyin/catalog matches.</summary>
    private static bool ShouldRetryActionQueryAfterReconnect(string? query, bool ok, int matchCount) =>
        ok
        && matchCount == 0
        && !string.IsNullOrEmpty(query)
        && IsAsciiPinyinQuery(query);

    private static bool IsAsciiPinyinQuery(string query)
    {
        var hasLetter = false;
        foreach (var ch in query)
        {
            if (ch > 127)
            {
                return false;
            }

            if (char.IsLetter(ch))
            {
                hasLetter = true;
            }
            else if (!char.IsDigit(ch))
            {
                return false;
            }
        }

        return hasLetter;
    }

    private static async Task<ServeInvokeResponse> ActionGetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var returnMode = ServeJsonArgs.GetString(args, "returnMode", "return-mode");
        var response = await rpc.GetCompressedActionByIdAsync(id.Trim(), returnMode, token).ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToGetPayload(response);
        return Ok(new { ok = response.Success, action = "get", payload });
    }

    private static async Task<ServeInvokeResponse> ActionCreateAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var response = await rpc
            .CreateActionAsync(
                ServeJsonArgs.GetString(args, "title"),
                ServeJsonArgs.GetString(args, "description"),
                ServeJsonArgs.GetString(args, "icon"),
                ServeJsonArgs.GetString(args, "profileId"),
                token)
            .ConfigureAwait(false);
        return Ok(new { ok = response.Ok, action = "create", message = response.Message, actionId = response.ActionId, editVersion = response.EditVersion });
    }

    private static async Task<ServeInvokeResponse> ActionPatchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var patchEl = ServeJsonArgs.GetObject(args, "patch");
        if (patchEl is null)
        {
            return Fail("MISSING_PATCH", "args.patch object is required.");
        }

        var patchJson = patchEl.Value.GetRawText();
        var response = await rpc
            .ApplyActionPatchToActionAsync(
                id.Trim(),
                patchJson,
                ServeJsonArgs.GetLong(args, "expectedEditVersion"),
                ServeJsonArgs.GetBool(args, "force"),
                token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToPatchPayload(response);
        return Ok(new { ok = response.Success, action = "patch", payload });
    }

    private static async Task<ServeInvokeResponse> ActionReplaceAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var xactionEl = ServeJsonArgs.GetObject(args, "xaction");
        if (xactionEl is null)
        {
            return Fail("MISSING_XACTION", "args.xaction object is required.");
        }

        var xactionJson = xactionEl.Value.GetRawText();
        var response = await rpc
            .ApplyXActionToActionAsync(
                id.Trim(),
                xactionJson,
                ServeJsonArgs.GetLong(args, "expectedEditVersion"),
                ServeJsonArgs.GetBool(args, "force"),
                token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToReplacePayload(response);
        return Ok(new { ok = response.Success, action = "replace", payload });
    }

    private static async Task<ServeInvokeResponse> ActionSetMetadataAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc
            .UpdateActionMetadataAsync(
                id.Trim(),
                ServeJsonArgs.GetString(args, "title"),
                ServeJsonArgs.GetString(args, "description"),
                ServeJsonArgs.GetString(args, "icon"),
                ServeJsonArgs.GetLong(args, "expectedEditVersion"),
                ServeJsonArgs.GetBool(args, "force"),
                token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToMetadataPayload(response);
        return Ok(new { ok = response.Success, action = "set-metadata", payload });
    }

    private static async Task<ServeInvokeResponse> ActionDeleteAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc
            .DeleteActionAsync(id.Trim(), showConfirm: false, token)
            .ConfigureAwait(false);
        return Ok(new { ok = response.Ok, action = "delete", message = response.Message, actionId = response.ActionId });
    }

    private static async Task<ServeInvokeResponse> ActionRunAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc
            .RunActionAsync(
                id.Trim(),
                ServeJsonArgs.GetString(args, "param"),
                ServeJsonArgs.GetBool(args, "debug"),
                ServeJsonArgs.GetBool(args, "wait"),
                token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "run",
            message = response.Message,
            actionId = response.ActionId,
            returnResult = response.ReturnResult,
        });
    }

    private static async Task<ServeInvokeResponse> ActionUpdateAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc
            .UpdateSharedActionAsync(id.Trim(), ServeJsonArgs.GetString(args, "changelog"), token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "update",
            sharedId = response.ActionId ?? id.Trim(),
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> ActionFloatAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc.FloatActionAsync(id.Trim(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "float",
            message = response.Message,
            actionId = response.ActionId,
            actionTitle = response.ActionTitle,
        });
    }

    private static async Task<ServeInvokeResponse> ActionEditAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var response = await rpc.EditActionAsync(id.Trim(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "edit",
            message = response.Message,
            actionId = response.ActionId,
        });
    }

    private static async Task<ServeInvokeResponse> ActionEditVarAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var variableKey = ServeJsonArgs.GetString(args, "var", "variableKey") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(variableKey))
        {
            return Fail("MISSING_VARIABLE", "args.var is required.");
        }

        var value = ServeJsonArgs.GetString(args, "value");
        if (value is null)
        {
            return Fail("MISSING_VALUE", "args.value is required.");
        }

        var response = await rpc
            .EditGlobalSubProgramVariableAsync(id.Trim(), variableKey.Trim(), value, token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "edit-var",
            targetKind = response.TargetKind,
            targetId = response.SubProgramIdOrName ?? id.Trim(),
            subProgramIdOrName = response.SubProgramIdOrName ?? id.Trim(),
            variableKey = response.VariableKey ?? variableKey.Trim(),
            oldValue = response.OldValue,
            newValue = response.NewValue ?? value,
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SubprogramSearchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var query = ServeJsonArgs.GetString(args, "query") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(query))
        {
            return Fail("MISSING_QUERY", "args.query is required.");
        }

        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 20;
        var response = await rpc.SearchGlobalSubProgramsAsync(query.Trim(), limit, token).ConfigureAwait(false);
        return Ok(new { ok = response.Ok, action = "subprogram-search", items = response.Items, message = response.Message });
    }

    private static async Task<ServeInvokeResponse> SubprogramListAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 30;
        var response = await rpc
            .ListGlobalSubProgramsAsync(ServeJsonArgs.GetString(args, "query"), limit, token)
            .ConfigureAwait(false);
        return Ok(new { ok = response.Ok, action = "subprogram-list", items = response.Items, message = response.Message });
    }

    private static async Task<ServeInvokeResponse> SubprogramCreateAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var name = ServeJsonArgs.GetString(args, "name") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
        {
            return Fail("MISSING_NAME", "args.name is required.");
        }

        var response = await rpc
            .CreateGlobalSubProgramAsync(
                name.Trim(),
                ServeJsonArgs.GetString(args, "description"),
                ServeJsonArgs.GetString(args, "icon"),
                token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "subprogram-create",
            message = response.Message,
            subProgramId = response.SubProgramId,
            callIdentifier = response.CallIdentifier,
            editVersion = response.EditVersion,
        });
    }

    private static async Task<ServeInvokeResponse> SubprogramGetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var returnMode = ServeJsonArgs.GetString(args, "returnMode");
        var response = await rpc
            .GetCompressedSubProgramAsync(id.Trim(), returnMode, token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToSubProgramGetPayload(response);
        return Ok(new { ok = response.Success, action = "subprogram-get", payload });
    }

    private static async Task<ServeInvokeResponse> SubprogramPatchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var patchEl = ServeJsonArgs.GetObject(args, "patch");
        if (patchEl is null)
        {
            return Fail("MISSING_PATCH", "args.patch object is required.");
        }

        var patchJson = patchEl.Value.GetRawText();
        var response = await rpc
            .ApplySubProgramPatchAsync(
                id.Trim(),
                patchJson,
                ServeJsonArgs.GetLong(args, "expectedEditVersion"),
                ServeJsonArgs.GetBool(args, "force"),
                token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToSubProgramPatchPayload(response);
        return Ok(new { ok = response.Success, action = "subprogram-patch", payload });
    }

    private static async Task<ServeInvokeResponse> SubprogramReplaceAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var programEl = ServeJsonArgs.GetObject(args, "program");
        if (programEl is null)
        {
            return Fail("MISSING_PROGRAM", "args.program object is required.");
        }

        var programJson = programEl.Value.GetRawText();
        var response = await rpc
            .ApplyProgramToSubProgramAsync(
                id.Trim(),
                programJson,
                ServeJsonArgs.GetLong(args, "expectedEditVersion"),
                ServeJsonArgs.GetBool(args, "force"),
                token)
            .ConfigureAwait(false);
        var payload = HeadlessCliResponses.ToSubProgramPatchPayload(response);
        return Ok(new { ok = response.Success, action = "subprogram-replace", payload });
    }

    private static async Task<ServeInvokeResponse> SubprogramEditAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var response = await rpc.EditGlobalSubProgramAsync(id.Trim(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "subprogram-edit",
            message = response.Message,
            actionId = response.ActionId,
        });
    }

    private static async Task<ServeInvokeResponse> SubprogramEditVarAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var variableKey = ServeJsonArgs.GetString(args, "var", "variableKey") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(variableKey))
        {
            return Fail("MISSING_VARIABLE", "args.var is required.");
        }

        var value = ServeJsonArgs.GetString(args, "value");
        if (value is null)
        {
            return Fail("MISSING_VALUE", "args.value is required.");
        }

        var response = await rpc
            .EditGlobalSubProgramVariableAsync(id.Trim(), variableKey.Trim(), value, token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "subprogram-edit-var",
            targetKind = response.TargetKind,
            subProgramIdOrName = response.SubProgramIdOrName ?? id.Trim(),
            variableKey = response.VariableKey ?? variableKey.Trim(),
            oldValue = response.OldValue,
            newValue = response.NewValue ?? value,
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SubprogramDeleteAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ID", "args.id is required.");
        }

        var response = await rpc
            .DeleteGlobalSubProgramAsync(id.Trim(), skipConfirm: true, token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "subprogram-delete",
            message = response.Message,
            actionId = response.ActionId,
        });
    }

    private static async Task<ServeInvokeResponse> StepRunnerSearchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var query = ServeJsonArgs.GetString(args, "query") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(query))
        {
            return Fail("MISSING_QUERY", "args.query is required.");
        }

        var limit = ServeJsonArgs.GetInt(args, "limit");
        var response = await rpc.SearchStepRunnersAsync(query.Trim(), limit, token).ConfigureAwait(false);
        return Ok(new { ok = response.Success, action = "step-runner-search", payload = response });
    }

    private static async Task<ServeInvokeResponse> StepRunnerGetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var key = ServeJsonArgs.GetString(args, "key") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail("MISSING_KEY", "args.key is required.");
        }

        var response = await rpc
            .GetStepRunnerDetailAsync(key.Trim(), ServeJsonArgs.GetString(args, "controlField"), token)
            .ConfigureAwait(false);
        return Ok(new { ok = response.Success, action = "step-runner-get", payload = response });
    }

    private static async Task<ServeInvokeResponse> FaSearchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 40;
        var expand = ServeJsonArgs.GetBool(args, "expand");
        var response = await rpc
            .SearchFontAwesomeIconsAsync(ServeJsonArgs.GetString(args, "query"), limit, expand, token)
            .ConfigureAwait(false);
        return Ok(new { ok = response.Success, action = "fa-search", payload = response });
    }

    private static async Task<ServeInvokeResponse> FaResolveAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var specs = ServeJsonArgs.GetStringList(args, "specs");
        if (specs.Count == 0)
        {
            var single = ServeJsonArgs.GetString(args, "spec");
            if (!string.IsNullOrWhiteSpace(single))
            {
                specs = new[] { single };
            }
        }

        if (specs.Count == 0)
        {
            return Fail("MISSING_SPECS", "args.specs or args.spec is required.");
        }

        var response = await rpc.ResolveFontAwesomeIconsAsync(specs, token).ConfigureAwait(false);
        return Ok(new { ok = response.Success, action = "fa-resolve", payload = response });
    }

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
