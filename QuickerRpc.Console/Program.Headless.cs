using System.Text.Json;
using System.Text.Json.Nodes;
using QuickerRpc.AgentModel.Api;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static readonly ActionAuthoringGuideService ActionAuthoringGuide = new();

    private static Task<int> RunGuideAsync(GuideOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "get" => RunGuideGetAsync(options),
            "search" => RunGuideSearchAsync(options),
            _ => ReportUnknownGuideVerbAsync(options),
        };
    }

    private static Task<int> ReportUnknownGuideVerbAsync(GuideOptions options) =>
        EmitErrorAndFailAsync(options.Json, "UNKNOWN_GUIDE_VERB",
            "Use: guide get --topic <id> [--json] | guide search [--query <keyword>] [--limit 10] [--json]");

    private static Task<int> RunGuideGetAsync(GuideOptions options)
    {
        var response = ActionAuthoringGuide.GetDoc(
            options.Topic ?? string.Empty,
            options.Reference);
        if (options.Json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = response.Success,
                    action = "guide-get",
                    success = response.Success,
                    errorMessage = response.ErrorMessage,
                    topic = response.Topic,
                    reference = response.Reference,
                    title = response.Title,
                    markdown = response.Markdown,
                    schema = response.Schema,
                    availableTopics = response.AvailableTopics,
                    availableReferences = response.AvailableReferences,
                },
                QkrpcJson.CliOutput));
        }
        else if (response.Success && !string.IsNullOrWhiteSpace(response.Markdown))
        {
            global::System.Console.WriteLine(response.Markdown);
        }
        else
        {
            global::System.Console.Error.WriteLine(response.ErrorMessage ?? "guide get failed");
            if (response.AvailableTopics?.Count > 0)
            {
                global::System.Console.Error.WriteLine("Topics: " + string.Join(", ", response.AvailableTopics));
            }
        }

        return Task.FromResult(response.Success ? ExitCodes.Success : ExitCodes.Error);
    }

    private static Task<int> RunGuideSearchAsync(GuideOptions options)
    {
        var response = ActionAuthoringGuide.Search(options.Query, options.Limit);
        if (options.Json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = response.Success,
                    action = "guide-search",
                    success = response.Success,
                    keyword = response.Keyword,
                    matchCount = response.MatchCount,
                    items = response.Items,
                    availableTopics = response.AvailableTopics,
                },
                QkrpcJson.CliOutput));
        }
        else
        {
            foreach (var item in response.Items)
            {
                global::System.Console.WriteLine($"{item.Topic}\t{item.Title}\t{item.Excerpt}");
            }
        }

        return Task.FromResult(response.Success ? ExitCodes.Success : ExitCodes.Error);
    }

    private static async Task<int> RunStepRunnerAsync(StepRunnerOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => await RunStepRunnerSearchAsync(options).ConfigureAwait(false),
            "get" => await RunStepRunnerGetAsync(options, forAgent: true).ConfigureAwait(false),
            "get-ui" => await RunStepRunnerGetAsync(options, forAgent: false).ConfigureAwait(false),
            "summaries" => await RunStepRunnerSummariesAsync(options).ConfigureAwait(false),
            _ => await ReportUnknownStepRunnerVerbAsync(options).ConfigureAwait(false),
        };
    }

    private static Task<int> ReportUnknownStepRunnerVerbAsync(StepRunnerOptions options) =>
        EmitErrorAndFailAsync(options.Json, "UNKNOWN_STEP_RUNNER_VERB",
            "Use: step-runner search | get | get-ui | summaries --request-file <json> [--json]");

    private static async Task<int> RunStepRunnerSearchAsync(StepRunnerOptions options)
    {
        var keyword = (options.Query ?? string.Empty).Trim();
        // Empty query lists the catalog (same as backend Search with no filter).
        if (string.IsNullOrWhiteSpace(keyword))
        {
            keyword = string.Empty;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .SearchStepRunnersAsync(keyword, options.Limit, rpcToken)
                .ConfigureAwait(false);

            WriteRpcJson(options.Json, "step-runner-search", response.Success, response);
            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "STEP_RUNNER_SEARCH_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunStepRunnerGetAsync(StepRunnerOptions options, bool forAgent)
    {
        var key = (options.Key ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(key))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_KEY", "Provide --key <stepRunnerKey>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var controlField = (options.ControlField ?? string.Empty).Trim();
            var controlArg = controlField.Length > 0 ? controlField : null;
            var response = forAgent
                ? await session.Proxy
                    .GetStepRunnerDetailAsync(key, controlArg, rpcToken)
                    .ConfigureAwait(false)
                : await session.Proxy
                    .GetStepRunnerUiDetailAsync(key, controlArg, rpcToken)
                    .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToStepRunnerDetailPayload(response);
            var action = forAgent ? "step-runner-get" : "step-runner-get-ui";

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action, payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "STEP_RUNNER_GET_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunStepRunnerSummariesAsync(StepRunnerOptions options)
    {
        var requestPath = (options.RequestFile ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(requestPath))
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_REQUEST_FILE",
                    "Provide --request-file <json> with { steps: [{ stepId, stepRunnerKey, stepJson }], subProgramsJson? }.")
                .ConfigureAwait(false);
        }

        string requestText;
        try
        {
            requestText = await global::System.IO.File.ReadAllTextAsync(requestPath).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "REQUEST_FILE_READ_FAILED", ex.Message)
                .ConfigureAwait(false);
        }

        JsonObject? root;
        try
        {
            root = JsonNode.Parse(requestText)?.AsObject();
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "REQUEST_JSON_INVALID", ex.Message)
                .ConfigureAwait(false);
        }

        if (root?["steps"] is not JsonArray stepsArray)
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_STEPS", "Request JSON must include a steps array.")
                .ConfigureAwait(false);
        }

        var steps = new List<QuickerRpcActionStepSummaryInput>();
        foreach (var token in stepsArray)
        {
            if (token is not JsonObject stepObj)
            {
                continue;
            }

            steps.Add(new QuickerRpcActionStepSummaryInput
            {
                StepId = stepObj["stepId"]?.GetValue<string>() ?? string.Empty,
                StepRunnerKey = stepObj["stepRunnerKey"]?.GetValue<string>() ?? string.Empty,
                StepJson = stepObj["stepJson"]?.GetValue<string>() ?? string.Empty,
            });
        }

        var subProgramsJson = root["subProgramsJson"]?.GetValue<string>();

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap)
                .ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .GetActionStepSummariesAsync(steps, subProgramsJson, rpcToken)
                .ConfigureAwait(false);

            WriteRpcJson(options.Json, "step-runner-summaries", response.Success, response);
            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "STEP_RUNNER_SUMMARIES_FAILED", ex.Message)
                .ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionGetAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ACTION_ID", "Provide --id <actionId>.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .GetCompressedActionByIdAsync(actionId, options.ReturnMode, rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToGetPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "get", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "GET_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionSetMetadataAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ACTION_ID", "Provide --id <actionId>.")
                .ConfigureAwait(false);
        }

        if (options.Title is null
            && options.Description is null
            && options.Icon is null
            && options.ContextMenuData is null)
        {
            return await EmitErrorAndFailAsync(
                    options.Json,
                    "MISSING_METADATA",
                    "Provide at least one of --title, --description, --icon, or --context-menu-data.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .UpdateActionMetadataAsync(
                    actionId,
                    options.Title,
                    options.Description,
                    options.Icon,
                    options.ContextMenuData,
                    options.ExpectedEditVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToMetadataPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "set-metadata", payload },
                    QkrpcJson.CliOutput));
            }
            else if (response.Success)
            {
                global::System.Console.WriteLine(
                    $"Updated metadata for {response.ActionId} (editVersion {response.EditVersion}, icon: {response.Icon}).");
            }
            else
            {
                global::System.Console.Error.WriteLine(response.ErrorMessage ?? "set-metadata failed");
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "SET_METADATA_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionPatchAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ACTION_ID", "Provide --id <actionId>.")
                .ConfigureAwait(false);
        }

        var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
            QkrpcJsonPayload.Resolve(options.Patch, options.PatchFile, "patch");
        if (!jsonOk)
        {
            return await EmitErrorAndFailAsync(options.Json, jsonErrorCode!, jsonErrorMessage!).ConfigureAwait(false);
        }

        if (!TryParseJsonObject(jsonText!, "patch", out var patchObj, out var parseError))
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_PATCH_JSON", parseError!).ConfigureAwait(false);
        }

        if (!QkrpcPatchPreprocess.TryPreprocessPatch(patchObj!, options.PatchFile, out var preprocessError))
        {
            return await EmitErrorAndFailAsync(options.Json, "FORM_SPEC_COMPILE_FAILED", preprocessError!)
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplyActionPatchToActionAsync(
                    actionId,
                    patchObj!.ToString(Newtonsoft.Json.Formatting.None),
                    options.ExpectedEditVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);
            var payload = HeadlessCliResponses.ToPatchPayload(response);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new { ok = response.Success, action = "patch", payload },
                    QkrpcJson.CliOutput));
            }
            else
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
            }

            if (response.Success)
            {
                HeadlessCliResponses.WriteWarningsToStderr(response.Warnings);
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "PATCH_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionReplaceAsync(ActionOptions options)
    {
        var actionId = (options.Id ?? options.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ACTION_ID", "Provide --id <actionId>.")
                .ConfigureAwait(false);
        }

        var (jsonOk, jsonText, jsonErrorCode, jsonErrorMessage) =
            QkrpcJsonPayload.Resolve(options.XAction, options.XActionFile, "xaction");
        if (!jsonOk)
        {
            return await EmitErrorAndFailAsync(options.Json, jsonErrorCode!, jsonErrorMessage!).ConfigureAwait(false);
        }

        if (!TryParseJsonObject(jsonText!, "xaction", out var xActionObj, out var parseError))
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_XACTION_JSON", parseError!).ConfigureAwait(false);
        }

        if (!QkrpcPatchPreprocess.TryPreprocessProgram(xActionObj!, options.XActionFile, out var preprocessError))
        {
            return await EmitErrorAndFailAsync(options.Json, "FORM_SPEC_COMPILE_FAILED", preprocessError!)
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await session.Proxy
                .ApplyXActionToActionAsync(
                    actionId,
                    xActionObj!.ToString(Newtonsoft.Json.Formatting.None),
                    options.ExpectedEditVersion,
                    options.Force,
                    rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = response.Success,
                        action = "replace",
                        success = response.Success,
                        errorMessage = response.ErrorMessage,
                        errorCode = response.ErrorCode,
                        actionId = response.ActionId,
                        editVersion = response.EditVersion,
                        versionConflict = response.VersionConflict,
                        updatedUtc = response.UpdatedUtc,
                        warnings = HeadlessCliResponses.ToWarningsArray(response.Warnings),
                    },
                    QkrpcJson.CliOutput));
            }
            else if (response.Success)
            {
                global::System.Console.WriteLine($"Replaced action {response.ActionId} (editVersion {response.EditVersion}).");
                HeadlessCliResponses.WriteWarningsToStderr(response.Warnings);
            }
            else
            {
                global::System.Console.Error.WriteLine(response.ErrorMessage ?? "replace failed");
            }

            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "REPLACE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionCreateAsync(ActionOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .CreateActionAsync(options.Title, options.Description, options.Icon, options.ProfileId, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "create",
                        actionId = result.ActionId,
                        profileId = result.ProfileId,
                        profileName = result.ProfileName,
                        exeFile = result.ExeFile,
                        row = result.Row,
                        col = result.Col,
                        editVersion = result.EditVersion,
                        createdProfile = result.CreatedProfile,
                        isVirtual = result.IsVirtual,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine(
                    $"{result.Message} actionId={result.ActionId} profile={result.ProfileName} ({result.Row},{result.Col}) editVersion={result.EditVersion}");
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
            return await EmitErrorAndFailAsync(options.Json, "CREATE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunActionMentionSearchAsync(ActionOptions options)
    {
        var query = (options.Query ?? string.Empty).Trim();
        var limit = options.Limit;
        if (limit < 1)
        {
            limit = 8;
        }

        limit = Math.Min(limit, 20);

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var actionResponse = await session.Proxy
                .SearchActionsAsync(query, limit, scope: null, rpcToken)
                .ConfigureAwait(false);
            var subprogramResponse = await session.Proxy
                .ListGlobalSubProgramsAsync(
                    string.IsNullOrWhiteSpace(query) ? null : query,
                    limit,
                    rpcToken)
                .ConfigureAwait(false);

            WriteActionMentionSearchRpcJson(options.Json, actionResponse, subprogramResponse, query, limit);
            return actionResponse.Ok || subprogramResponse.Ok ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "MENTION_SEARCH_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static void WriteActionMentionSearchRpcJson(
        bool json,
        QuickerRpcActionSearchResult actionResponse,
        QuickerRpcSubProgramSearchResult subprogramResponse,
        string query,
        int limit)
    {
        var payloadNode = AgentApiMentionSearchJson.ToMergedPayload(
            actionResponse,
            subprogramResponse,
            query,
            limit);
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = actionResponse.Ok || subprogramResponse.Ok,
                    action = "mention-search",
                    payload = payloadNode,
                },
                QkrpcJson.CliOutput));
            return;
        }

        global::System.Console.WriteLine(JsonSerializer.Serialize(payloadNode, QkrpcJson.CliOutput));
    }

    private static async Task<int> RunActionListAsync(ActionOptions options)
    {
        if (!ActionQueryFilter.TryResolveQuery(options.Query, options.QueryFile, options.Filter, options.Fields, out var query, out var filterError))
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_QUERY", filterError ?? "Invalid query.")
                .ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var response = await QuickerRpcActionListCompat
                .ListAsync(
                    session.Proxy,
                    session.JsonRpc,
                    string.IsNullOrWhiteSpace(query) ? null : query,
                    options.Limit,
                    options.Scope,
                    options.Sort,
                    rpcToken)
                .ConfigureAwait(false);

            WriteActionListRpcJson(options.Json, "list", response.Success, response);
            return response.Success ? ExitCodes.Success : ExitCodes.Error;
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
            return await EmitErrorAndFailAsync(options.Json, "LIST_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static bool TryParseJsonObject(string json, string paramName, out Newtonsoft.Json.Linq.JObject? obj, out string? error)
    {
        obj = null;
        error = null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!AgentJson.TryToJObject(doc.RootElement, paramName, out obj, out error))
            {
                return false;
            }

            return true;
        }
        catch (JsonException ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static void WriteActionListRpcJson(
        bool json,
        string action,
        bool success,
        QuickerRpcSearchActionSummariesResult response)
    {
        if (!json)
        {
            var fields = ResolveTerminalFields(response);
            if (fields is not null)
            {
                global::System.Console.WriteLine(ActionSummaryFieldCatalog.FormatTsvHeader(fields));
                foreach (var item in response.Items ?? Array.Empty<QuickerRpcActionSummaryItem>())
                {
                    global::System.Console.WriteLine(ActionSummaryFieldCatalog.FormatTsvLine(item, fields));
                }

                return;
            }

            global::System.Console.WriteLine(
                JsonSerializer.Serialize(response, QkrpcJson.CliOutput));
            return;
        }

        var payloadNode = AgentApiListJson.ToPayload(response);
        global::System.Console.WriteLine(JsonSerializer.Serialize(
            new { ok = success, action, payload = payloadNode },
            QkrpcJson.CliOutput));
    }

    private static IReadOnlyList<string>? ResolveTerminalFields(QuickerRpcSearchActionSummariesResult response)
    {
        if (response.Fields is { Count: > 0 } fields
            && ActionSummaryFieldCatalog.TryNormalize(fields, out var normalized, out _))
        {
            return normalized;
        }

        return null;
    }

    private static void WriteRpcJson(bool json, string action, bool success, object payload)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new { ok = success, action, payload },
                QkrpcJson.CliOutput));
        }
        else
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(payload, QkrpcJson.CliOutput));
        }
    }

    private static async Task<int> EmitErrorAndFailAsync(bool json, string code, string message)
    {
        await EmitErrorAsync(json, code, message).ConfigureAwait(false);
        return ExitCodes.Error;
    }
}
