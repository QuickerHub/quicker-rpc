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
            "action.publish" => await ActionPublishAsync(rpc, args, token).ConfigureAwait(false),
            "action.move" => await ActionMoveAsync(rpc, args, token).ConfigureAwait(false),
            "action.delete" => await ActionDeleteAsync(rpc, args, token).ConfigureAwait(false),
            "action.run" => await ActionRunAsync(rpc, args, token).ConfigureAwait(false),
            "action.float" => await ActionFloatAsync(rpc, args, token).ConfigureAwait(false),
            "action.edit" => await ActionEditAsync(rpc, args, token).ConfigureAwait(false),
            "action.edit-var" => await ActionEditVarAsync(rpc, args, token).ConfigureAwait(false),
            "action.extract" => await ActionProjectServeOps.ExtractAsync(rpc, args, token).ConfigureAwait(false),
            "action.validate" => ActionProjectServeOps.Validate(args),
            "action.apply" => await ActionProjectServeOps.ApplyAsync(rpc, args, token).ConfigureAwait(false),
            "profile.create" => await ProfileCreateAsync(rpc, args, token).ConfigureAwait(false),
            "profile.delete" => await ProfileDeleteAsync(rpc, args, token).ConfigureAwait(false),
            "profile.prune" => await ProfilePruneAsync(rpc, args, token).ConfigureAwait(false),
            "profile.reorder" => await ProfileReorderAsync(rpc, args, token).ConfigureAwait(false),
            "process.ensure" => await ProcessEnsureAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.search" => await SubprogramSearchAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.list" => await SubprogramListAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.create" => await SubprogramCreateAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.get" => await SubprogramGetAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.patch" => await SubprogramPatchAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.replace" => await SubprogramReplaceAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.edit" => await SubprogramEditAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.edit-var" => await SubprogramEditVarAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.delete" => await SubprogramDeleteAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.validate" => SubProgramProjectServeOps.Validate(args),
            "subprogram.export" => await SubProgramProjectServeOps.ExportAsync(rpc, args, token).ConfigureAwait(false),
            "subprogram.import" => await SubProgramProjectServeOps.ImportAsync(rpc, args, token).ConfigureAwait(false),
            "step-runner.search" => await StepRunnerSearchAsync(rpc, args, token).ConfigureAwait(false),
            "step-runner.get" => await StepRunnerGetAsync(rpc, args, forAgent: true, token).ConfigureAwait(false),
            "step-runner.getUi" => await StepRunnerGetAsync(rpc, args, forAgent: false, token).ConfigureAwait(false),
            "fa.search" => await FaSearchAsync(rpc, args, token).ConfigureAwait(false),
            "expr.check" => await ExprCheckAsync(rpc, args, token).ConfigureAwait(false),
            "expr.run" => await ExprRunAsync(rpc, args, token).ConfigureAwait(false),
            "script.check" => await ScriptCheckAsync(rpc, args, token).ConfigureAwait(false),
            "project.lint.schedule" => ProjectLintSchedule(pool, args, cancellationToken),
            "project.diagnostics.get" => ProjectDiagnosticsGet(args),
            "fa.resolve" => await FaResolveAsync(rpc, args, token).ConfigureAwait(false),
            "quicker.account.get" => await QuickerAccountGetAsync(rpc, token).ConfigureAwait(false),
            "settings.search" => await SettingsSearchAsync(rpc, args, token).ConfigureAwait(false),
            "settings.list" => await SettingsListAsync(rpc, args, token).ConfigureAwait(false),
            "settings.get" => await SettingsGetAsync(rpc, args, token).ConfigureAwait(false),
            "settings.set" => await SettingsSetAsync(rpc, args, token).ConfigureAwait(false),
            "settings.apply" => await SettingsApplyAsync(rpc, args, token).ConfigureAwait(false),
            "settings.pages" => await SettingsPagesAsync(rpc, token).ConfigureAwait(false),
            "settings.links" => await SettingsLinksAsync(rpc, token).ConfigureAwait(false),
            "settings.open" => await SettingsOpenAsync(rpc, args, token).ConfigureAwait(false),
            "settings.resolve" => await SettingsResolveAsync(rpc, args, token).ConfigureAwait(false),
            "launcher.resolve" => await LauncherResolveAsync(rpc, args, token).ConfigureAwait(false),
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

    private static async Task<ServeInvokeResponse> QuickerAccountGetAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken)
    {
        var account = await rpc.GetQuickerAccountAsync(cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = account.Ok,
            action = "quicker-account-get",
            loggedIn = account.LoggedIn,
            userId = account.UserId,
            userName = account.UserName,
            nickName = account.NickName,
            message = account.Message,
        });
    }

    private static Task<ServeInvokeResponse> SettingsSearchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken) =>
        SettingsListAsync(rpc, args, cancellationToken);

    private static async Task<ServeInvokeResponse> SettingsListAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var query = ServeJsonArgs.GetString(args, "query");
        var scope = ServeJsonArgs.GetString(args, "scope");
        var maxResults = ServeJsonArgs.GetInt(args, "maxResults")
            ?? ServeJsonArgs.GetInt(args, "limit")
            ?? 100;

        if (!string.IsNullOrWhiteSpace(query))
        {
            var searchResult = await rpc
                .SearchSettingsAsync(query.Trim(), maxResults, cancellationToken)
                .ConfigureAwait(false);
            return Ok(new
            {
                ok = searchResult.Ok,
                action = "settings-list",
                query = searchResult.Query,
                items = searchResult.Items,
                pages = searchResult.Pages,
                message = searchResult.Message,
            });
        }

        var result = await rpc.ListSettingsAsync(scope, maxResults, cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-list",
            scope = result.Scope,
            items = result.Items,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsGetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var key = ServeJsonArgs.GetString(args, "key") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail("MISSING_KEY", "args.key is required.");
        }

        var result = await rpc.GetSettingAsync(key, cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-get",
            key = result.Key,
            scope = result.Scope,
            path = result.Path,
            exeFile = result.ExeFile,
            type = result.Type,
            value = result.Value,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsSetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var key = ServeJsonArgs.GetString(args, "key") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail("MISSING_KEY", "args.key is required.");
        }

        var value = ServeJsonArgs.GetString(args, "value");
        if (value is null)
        {
            return Fail("MISSING_VALUE", "args.value is required.");
        }

        var result = await rpc.SetSettingAsync(key, value, cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-set",
            key = result.Key,
            type = result.Type,
            value = result.Value,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsApplyAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var changes = SettingsChangesParser.ParseFromServeArgs(args, out var parseError);
        if (changes is null)
        {
            return Fail("INVALID_CHANGES", parseError ?? "Invalid changes.");
        }

        var result = await rpc.ApplySettingsAsync(changes, cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-apply",
            appliedCount = result.AppliedCount,
            failedCount = result.FailedCount,
            results = result.Results,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsPagesAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken)
    {
        var result = await rpc.ListSettingsPagesAsync(cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-pages",
            pages = result.Pages,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsLinksAsync(
        IQuickerRpcService rpc,
        CancellationToken cancellationToken)
    {
        var result = await rpc.ListSettingsDirectLinksAsync(cancellationToken).ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-links",
            links = result.Links,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsOpenAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var target = ServeJsonArgs.GetString(args, "page", "target", "pageId");
        var query = ServeJsonArgs.GetString(args, "query");
        var settingKey = ServeJsonArgs.GetString(args, "key", "settingKey");
        var searchText = ServeJsonArgs.GetString(args, "searchText", "search-text");
        var preset = ServeJsonArgs.GetString(args, "preset", "link");
        var exeFile = ServeJsonArgs.GetString(args, "exe", "exeFile");
        var result = await rpc
            .OpenSettingsUiAsync(target, exeFile, searchText, query, settingKey, preset, cancellationToken)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-open",
            preset = result.PresetId,
            target = result.Target,
            pageId = result.PageId,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> SettingsResolveAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var query = ServeJsonArgs.GetString(args, "query");
        var settingKey = ServeJsonArgs.GetString(args, "key", "settingKey");
        var preset = ServeJsonArgs.GetString(args, "preset", "link");
        var result = await rpc
            .ResolveSettingsIntentAsync(query, settingKey, preset, cancellationToken)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "settings-resolve",
            intent = result.Intent,
            preset = result.PresetId,
            target = result.Target,
            pageId = result.PageId,
            settingKey = result.SettingKey,
            searchText = result.SearchText,
            suggestedAction = result.SuggestedAction,
            message = result.Message,
        });
    }

    private static async Task<ServeInvokeResponse> LauncherResolveAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var query = ServeJsonArgs.GetString(args, "query") ?? string.Empty;
        if (query.Trim().Length == 0)
        {
            return Fail("MISSING_QUERY", "args.query is required.");
        }

        var limit = ServeJsonArgs.GetInt(args, "limit")
            ?? ServeJsonArgs.GetInt(args, "maxResults")
            ?? 12;
        var scopes = ServeJsonArgs.GetString(args, "scopes", "scope");
        var result = await rpc
            .ResolveLauncherIntentAsync(query.Trim(), limit, scopes, cancellationToken)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = result.Ok,
            action = "launcher-resolve",
            query = result.Query,
            normalizedQuery = result.NormalizedQuery,
            message = result.Message,
            candidates = result.Candidates.Select(c => new
            {
                kind = c.Kind,
                score = c.Score,
                title = c.Title,
                subtitle = c.Subtitle,
                intent = c.Intent,
                pageId = c.PageId,
                presetId = c.PresetId,
                settingKey = c.SettingKey,
                actionId = c.ActionId,
                subProgramId = c.SubProgramId,
                target = c.Target,
                suggestedTool = c.SuggestedTool,
                suggestedInput = c.SuggestedInputJson is null
                    ? null
                    : JsonSerializer.Deserialize<object>(c.SuggestedInputJson),
                reason = c.Reason,
            }),
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
        var queryFile = ServeJsonArgs.GetString(args, "queryFile");
        var filter = ServeJsonArgs.GetString(args, "filter");
        var fields = ServeJsonArgs.GetString(args, "fields");
        var scope = ServeJsonArgs.GetString(args, "scope");
        var limit = ServeJsonArgs.GetInt(args, "limit") ?? 30;
        var sort = ServeJsonArgs.GetString(args, "sort");
        if (!ActionQueryFilter.TryResolveQuery(query, queryFile, filter, fields, out var mergedQuery, out var queryError))
        {
            return Fail("INVALID_QUERY", queryError ?? "Invalid query.");
        }

        var queryTrimmed = string.IsNullOrWhiteSpace(mergedQuery) ? null : mergedQuery.Trim();
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

    private static Task<ServeInvokeResponse> ActionSearchAsync(
        QkrpcRpcSessionPool pool,
        JsonElement args,
        CancellationToken token) =>
        ActionListAsync(pool, args, token);

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
                ServeJsonArgs.GetString(args, "contextMenuData"),
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

    private static async Task<ServeInvokeResponse> ActionMoveAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var profile = ServeJsonArgs.GetString(args, "profile", "profileId", "targetProfile") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(profile))
        {
            return Fail("MISSING_TARGET_PROFILE", "args.profile is required.");
        }

        var row = ServeJsonArgs.GetInt(args, "row") ?? ServeJsonArgs.GetInt(args, "targetRow");
        var col = ServeJsonArgs.GetInt(args, "col") ?? ServeJsonArgs.GetInt(args, "targetCol");
        if ((row.HasValue && !col.HasValue) || (!row.HasValue && col.HasValue))
        {
            return Fail("MISSING_TARGET_POSITION", "Provide both args.row and args.col, or neither.");
        }

        var response = await rpc
            .MoveActionAsync(
                id.Trim(),
                profile.Trim(),
                row,
                col,
                ServeJsonArgs.GetBool(args, "swap") || ServeJsonArgs.GetBool(args, "allowSwap"),
                ServeJsonArgs.GetString(args, "onNoEmptySlot", "on-no-empty-slot"),
                ServeJsonArgs.GetString(args, "onOccupiedSlot", "on-occupied-slot"),
                token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "move",
            needsUserChoice = response.NeedsUserChoice,
            conflictReason = response.ConflictReason,
            choices = response.Choices,
            message = response.Message,
            actionId = response.ActionId,
            actionTitle = response.ActionTitle,
            sourceProfileId = response.SourceProfileId,
            sourceProfileName = response.SourceProfileName,
            sourceRow = response.SourceRow,
            sourceCol = response.SourceCol,
            targetProfileId = response.TargetProfileId,
            targetProfileName = response.TargetProfileName,
            targetRow = response.TargetRow,
            targetCol = response.TargetCol,
            swappedActionId = response.SwappedActionId,
            swappedActionTitle = response.SwappedActionTitle,
            occupiedActionId = response.OccupiedActionId,
            occupiedActionTitle = response.OccupiedActionTitle,
            createdProfile = response.CreatedProfile,
            createdProfileId = response.CreatedProfileId,
            createdProfileName = response.CreatedProfileName,
            reusedProfile = response.ReusedProfile,
            reusedProfileId = response.ReusedProfileId,
            reusedProfileName = response.ReusedProfileName,
            deletedSourceProfile = response.DeletedSourceProfile,
            deletedSourceProfileId = response.DeletedSourceProfileId,
            deletedSourceProfileName = response.DeletedSourceProfileName,
        });
    }

    private static async Task<ServeInvokeResponse> ProfilePruneAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var scope = ServeJsonArgs.GetString(args, "scope", "exe", "exeFile") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(scope))
        {
            return Fail("MISSING_SCOPE", "args.scope is required (e.g. chrome.exe, global).");
        }

        var response = await rpc.PruneEmptyProfilesAsync(scope.Trim(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "profile-prune",
            scope = scope.Trim(),
            deleted = response.Deleted,
            failures = response.Failures,
            message = response.Message,
        });
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

        var trace = ServeJsonArgs.GetBool(args, "trace");
        if (trace)
        {
            var traceResponse = await rpc
                .RunActionTraceAsync(id.Trim(), ServeJsonArgs.GetString(args, "param"), token)
                .ConfigureAwait(false);
            return Ok(new
            {
                ok = traceResponse.Ok,
                action = "trace",
                message = traceResponse.Message,
                actionId = traceResponse.ActionId,
                actionTitle = traceResponse.ActionTitle,
                durationMs = traceResponse.DurationMs,
                eventCount = traceResponse.EventCount,
                returnResult = traceResponse.ReturnResult,
                errorMessage = traceResponse.ErrorMessage,
                stopFlag = traceResponse.StopFlag,
                events = traceResponse.Events,
            });
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
            actionTitle = response.ActionTitle,
            returnResult = response.ReturnResult,
            errorMessage = response.ErrorMessage,
            stopFlag = response.StopFlag,
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

    private static async Task<ServeInvokeResponse> ActionPublishAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var id = ServeJsonArgs.GetString(args, "id", "actionId") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(id))
        {
            return Fail("MISSING_ACTION_ID", "args.id is required.");
        }

        var request = new QuickerRpcActionPublishRequest
        {
            Title = ServeJsonArgs.GetString(args, "title"),
            Description = ServeJsonArgs.GetString(args, "description"),
            Note = ServeJsonArgs.GetString(args, "note", "shareNote"),
            Tags = ServeJsonArgs.GetString(args, "tags"),
            Keywords = ServeJsonArgs.GetString(args, "keywords"),
            ChangeLog = ServeJsonArgs.GetString(args, "changelog"),
            IsPublic = !ServeJsonArgs.GetBool(args, "private"),
            SubmitReview = !ServeJsonArgs.GetBool(args, "noSubmitReview"),
        };

        var response = await rpc.PublishSharedActionAsync(id.Trim(), request, token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "publish",
            mode = response.Mode ?? "publish",
            actionId = response.ActionId ?? id.Trim(),
            sharedId = response.SharedActionId,
            shareUrl = response.ShareUrl,
            revision = response.Revision,
            isPublic = response.IsPublic,
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

    private static Task<ServeInvokeResponse> SubprogramSearchAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token) =>
        SubprogramListAsync(rpc, args, token);

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

    private static async Task<ServeInvokeResponse> ProfileCreateAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var scope = ServeJsonArgs.GetString(args, "scope") ?? string.Empty;
        if (!string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(scope, "全局", StringComparison.OrdinalIgnoreCase))
        {
            return Fail("UNSUPPORTED_SCOPE", "args.scope must be global.");
        }

        var count = ServeJsonArgs.GetInt(args, "count") ?? 1;
        if (count <= 0 || count > 20)
        {
            return Fail("INVALID_COUNT", "args.count must be between 1 and 20.");
        }

        var afterFirst = ServeJsonArgs.GetBool(args, "afterFirst")
            || ServeJsonArgs.GetBool(args, "after-first");
        var response = await rpc.CreateGlobalProfilesAsync(count, afterFirst, token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "profile-create",
            scope = "global",
            count,
            afterFirst,
            insertAfterProfileId = response.InsertAfterProfileId,
            insertAfterProfileName = response.InsertAfterProfileName,
            items = response.Items,
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> ProfileDeleteAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var ids = ServeJsonArgs.GetStringList(args, "profileIds");
        if (ids.Count == 0)
        {
            ids = ServeJsonArgs.GetStringList(args, "ids");
        }

        var single = ServeJsonArgs.GetString(args, "profileId", "id", "profile");
        if (ids.Count == 0 && !string.IsNullOrWhiteSpace(single))
        {
            ids = new[] { single.Trim() };
        }

        if (ids.Count == 0)
        {
            return Fail("MISSING_PROFILE_IDS", "args.id or args.profileIds is required.");
        }

        var response = await rpc.DeleteEmptyProfilesAsync(ids.ToList(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "profile-delete",
            deleted = response.Deleted,
            failures = response.Failures,
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> ProfileReorderAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var scope = ServeJsonArgs.GetString(args, "scope") ?? string.Empty;
        if (!string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(scope, "全局", StringComparison.OrdinalIgnoreCase))
        {
            return Fail("UNSUPPORTED_SCOPE", "args.scope must be global.");
        }

        if (!ServeJsonArgs.GetBool(args, "afterFirst") && !ServeJsonArgs.GetBool(args, "after-first"))
        {
            return Fail("MISSING_AFTER_FIRST", "args.afterFirst must be true.");
        }

        var ids = ServeJsonArgs.GetStringList(args, "profileIds");
        if (ids.Count == 0)
        {
            ids = ServeJsonArgs.GetStringList(args, "ids");
        }

        var single = ServeJsonArgs.GetString(args, "profileId", "id");
        if (ids.Count == 0 && !string.IsNullOrWhiteSpace(single))
        {
            ids = new[] { single.Trim() };
        }

        if (ids.Count == 0)
        {
            return Fail("MISSING_PROFILE_IDS", "args.profileIds is required.");
        }

        var response = await rpc.ReorderGlobalProfilesAfterFirstAsync(ids.ToList(), token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "profile-reorder",
            scope = "global",
            afterFirst = true,
            profileIds = ids,
            insertAfterProfileId = response.InsertAfterProfileId,
            insertAfterProfileName = response.InsertAfterProfileName,
            items = response.Items,
            message = response.Message,
        });
    }

    private static async Task<ServeInvokeResponse> ProcessEnsureAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var exeFile = ServeJsonArgs.GetString(args, "exeFile")
            ?? ServeJsonArgs.GetString(args, "exe")
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(exeFile))
        {
            return Fail("MISSING_EXE", "args.exeFile is required.");
        }

        var displayName = ServeJsonArgs.GetString(args, "displayName")
            ?? ServeJsonArgs.GetString(args, "name")
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(displayName))
        {
            return Fail("MISSING_NAME", "args.displayName is required.");
        }

        var profilePrefix = ServeJsonArgs.GetString(args, "profileNamePrefix")
            ?? ServeJsonArgs.GetString(args, "profile-prefix")
            ?? ServeJsonArgs.GetString(args, "profilePrefix")
            ?? string.Empty;
        if (string.IsNullOrWhiteSpace(profilePrefix))
        {
            return Fail("MISSING_PROFILE_PREFIX", "args.profileNamePrefix is required.");
        }

        var moveActions = ServeJsonArgs.GetBool(args, "moveMatchingActions")
            || ServeJsonArgs.GetBool(args, "move-matching-actions")
            || ServeJsonArgs.GetBool(args, "moveActions")
            || ServeJsonArgs.GetBool(args, "move-actions");
        var collectSubProgram = ServeJsonArgs.GetString(args, "collectSubProgramName")
            ?? ServeJsonArgs.GetString(args, "collect-subprogram")
            ?? ServeJsonArgs.GetString(args, "collectSubProgram");
        if (moveActions && string.IsNullOrWhiteSpace(collectSubProgram))
        {
            return Fail("MISSING_COLLECT_SUBPROGRAM", "args.collectSubProgramName is required when moveActions is true.");
        }

        var moveAny = ServeJsonArgs.GetBool(args, "moveAny")
            || ServeJsonArgs.GetBool(args, "move-any");
        var dedicatedOnly = !moveAny;
        if (!moveActions)
        {
            collectSubProgram = null;
        }

        var response = await rpc.EnsureVirtualProcessAsync(
            exeFile.Trim(),
            displayName.Trim(),
            profilePrefix.Trim(),
            string.IsNullOrWhiteSpace(collectSubProgram) ? null : collectSubProgram.Trim(),
            dedicatedOnly,
            token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "process-ensure",
            exeFile = response.ExeFile,
            displayName = response.DisplayName,
            scope = response.Scope,
            profileId = response.ProfileId,
            profileName = response.ProfileName,
            createdProcess = response.CreatedProcess,
            createdProfile = response.CreatedProfile,
            inExeSettingsDict = response.InExeSettingsDict,
            movedActions = response.MovedActions,
            message = response.Message,
        });
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
        var trimmedQuery = query.Trim();
        if (StepRunnerServeCache.TryGetSearch(trimmedQuery, limit, out var cached) && cached is not null)
        {
            return Ok(new { ok = cached.Success, action = "step-runner-search", payload = cached });
        }

        var response = await rpc.SearchStepRunnersAsync(trimmedQuery, limit, token).ConfigureAwait(false);
        StepRunnerServeCache.SetSearch(trimmedQuery, limit, response);
        return Ok(new { ok = response.Success, action = "step-runner-search", payload = response });
    }

    private static async Task<ServeInvokeResponse> StepRunnerGetAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        bool forAgent,
        CancellationToken token)
    {
        var key = ServeJsonArgs.GetString(args, "key") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(key))
        {
            return Fail("MISSING_KEY", "args.key is required.");
        }

        var trimmedKey = key.Trim();
        var controlField = ServeJsonArgs.GetString(args, "controlField");
        var action = forAgent ? "step-runner-get" : "step-runner-get-ui";
        if (forAgent)
        {
            if (StepRunnerServeCache.TryGetAgentDetail(trimmedKey, controlField, out var cached) && cached is not null)
            {
                return Ok(new
                {
                    ok = cached.Success,
                    action,
                    payload = HeadlessCliResponses.ToStepRunnerDetailPayload(cached),
                });
            }
        }
        else if (StepRunnerServeCache.TryGetUiDetail(trimmedKey, controlField, out var cachedUi) && cachedUi is not null)
        {
            return Ok(new
            {
                ok = cachedUi.Success,
                action,
                payload = HeadlessCliResponses.ToStepRunnerDetailPayload(cachedUi),
            });
        }

        var response = forAgent
            ? await rpc.GetStepRunnerDetailAsync(trimmedKey, controlField, token).ConfigureAwait(false)
            : await rpc.GetStepRunnerUiDetailAsync(trimmedKey, controlField, token).ConfigureAwait(false);
        if (forAgent)
        {
            StepRunnerServeCache.SetAgentDetail(trimmedKey, controlField, response);
        }
        else
        {
            StepRunnerServeCache.SetUiDetail(trimmedKey, controlField, response);
        }

        return Ok(new
        {
            ok = response.Success,
            action,
            payload = HeadlessCliResponses.ToStepRunnerDetailPayload(response),
        });
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

    private static ServeInvokeResponse ProjectLintSchedule(
        QkrpcRpcSessionPool pool,
        JsonElement args,
        CancellationToken cancellationToken)
    {
        var response = ProgramSyntaxLintServeOps.Schedule(args);
        if (response.Ok)
        {
            ProgramSyntaxLintServeOps.StartBackgroundLint(pool, args, cancellationToken);
        }

        return response;
    }

    private static ServeInvokeResponse ProjectDiagnosticsGet(JsonElement args) =>
        ProgramSyntaxLintServeOps.GetDiagnostics(args);

    private static async Task<ServeInvokeResponse> ExprCheckAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var code = ServeJsonArgs.GetString(args, "code");
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("MISSING_CODE", "args.code is required.");
        }

        var variables = ServeJsonArgs.GetStringDictionary(args, "variables");
        var response = await rpc.CheckExpressionSyntaxAsync(code, variables, token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "expr-check",
            success = response.Success,
            kind = response.Kind,
            message = response.Message,
            errorCode = response.ErrorCode,
        });
    }

    private static async Task<ServeInvokeResponse> ExprRunAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var code = ServeJsonArgs.GetString(args, "code");
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("MISSING_CODE", "args.code is required.");
        }

        var variablesJson = ServeJsonArgs.GetObject(args, "variables")?.GetRawText();
        var onUiThread = ServeJsonArgs.GetBool(args, "onUiThread")
            || ServeJsonArgs.GetBool(args, "on_ui_thread");
        var response = await rpc
            .ExecuteExpressionAsync(code, variablesJson, onUiThread, token)
            .ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "expr-run",
            success = response.Success,
            message = response.Message,
            errorCode = response.ErrorCode,
            resultJson = response.ResultJson,
            resultType = response.ResultType,
            variablesJson = response.VariablesJson,
        });
    }

    private static async Task<ServeInvokeResponse> ScriptCheckAsync(
        IQuickerRpcService rpc,
        JsonElement args,
        CancellationToken token)
    {
        var code = ServeJsonArgs.GetString(args, "code");
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("MISSING_CODE", "args.code is required.");
        }

        var references = ServeJsonArgs.GetString(args, "references");
        var response = await rpc.CheckCSharpScriptSyntaxAsync(code, references, token).ConfigureAwait(false);
        return Ok(new
        {
            ok = response.Ok,
            action = "script-check",
            success = response.Success,
            kind = response.Kind,
            message = response.Message,
            errorCode = response.ErrorCode,
        });
    }

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}
