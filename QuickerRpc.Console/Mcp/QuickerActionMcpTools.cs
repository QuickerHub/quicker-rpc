using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;
using ModelContextProtocol.Server;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.Guides;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Mcp;

/// <summary>MCP tools for headless Quicker XAction read/write (via QuickerRpc plugin RPC).</summary>
[McpServerToolType]
public sealed class QuickerActionMcpTools
{
    private static readonly JsonSerializerOptions ToolJson = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly int _timeoutSeconds;
    private readonly bool _tryBootstrap;
    private readonly ActionAuthoringGuideService _actionAuthoringGuide;

    public QuickerActionMcpTools(int timeoutSeconds, bool tryBootstrap)
    {
        _timeoutSeconds = timeoutSeconds;
        _tryBootstrap = tryBootstrap;
        _actionAuthoringGuide = new ActionAuthoringGuideService();
    }

    [McpServerTool(Name = "action_get", Title = "Get action (compressed)"), Description(
        "Read a persisted Quicker XAction by actionId (GUID). " +
        "returnMode: full (default) = steps+variables with non-default input/output params only; " +
        "structure = step tree without params; metadata = title/description/icon + stepOutline. " +
        "Before first edit, read guide_get topic overview and xaction-json.")]
    public async Task<string> GetCompressedActionByIdAsync(
        [Description("Quicker catalog action id (GUID string).")] string actionId,
        [Description("Read shape: full | structure | metadata.")]
        string? returnMode = null,
        CancellationToken cancellationToken = default)
    {
        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .GetCompressedActionByIdAsync(actionId, returnMode, linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(ToMcpGetResponse(response), ToolJson);
    }

    [McpServerTool(Name = "action_replace", Title = "Replace action program"), Description(
        "Replace steps/variables on a persisted Quicker action by actionId (GUID). " +
        "xAction: { steps, variables, optional subPrograms }; subPrograms omitted = preserved.")]
    public async Task<string> ApplyXActionToActionAsync(
        [Description("Quicker catalog action id (GUID string).")] string actionId,
        [Description("XAction JSON object: { steps, variables, optional subPrograms }.")] JsonElement xAction,
        [Description("Optional edit version from action_get.")]
        long? expectedEditVersion = null,
        [Description("When true, skip version check and overwrite.")]
        bool? force = null,
        CancellationToken cancellationToken = default)
    {
        if (!AgentJson.TryToJObject(xAction, "xAction", out var xActionObj, out var parseError))
        {
            return JsonSerializer.Serialize(
                new { success = false, actionId, errorMessage = parseError },
                ToolJson);
        }

        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .ApplyXActionToActionAsync(
                actionId,
                xActionObj!.ToString(Newtonsoft.Json.Formatting.None),
                expectedEditVersion,
                force ?? false,
                linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(response, ToolJson);
    }

    [McpServerTool(Name = "action_patch", Title = "Patch action program"), Description(
        "Apply a partial program patch to a persisted Quicker action by actionId (GUID). " +
        "Each steps[]/variables[] entry may use op: update (default)|add|remove|move. " +
        "On success returns editVersion plus compressed added/updated steps and variables — use that response; " +
        "do not call action_get afterward only to verify. See guide_get topic patch-workflow.")]
    public async Task<string> ApplyActionPatchToActionAsync(
        [Description("Quicker catalog action id (GUID string).")] string actionId,
        [Description("Partial patch object with optional steps and variables arrays.")]
        JsonElement patch,
        [Description("Optional edit version from action_get.")]
        long? expectedEditVersion = null,
        [Description("When true, skip version check and overwrite.")]
        bool? force = null,
        CancellationToken cancellationToken = default)
    {
        if (!AgentJson.TryToJObject(patch, "patch", out var patchObj, out var parseError))
        {
            return JsonSerializer.Serialize(
                new { success = false, actionId, errorMessage = parseError },
                ToolJson);
        }

        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .ApplyActionPatchToActionAsync(
                actionId,
                patchObj!.ToString(Newtonsoft.Json.Formatting.None),
                expectedEditVersion,
                force ?? false,
                linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(ToMcpPatchResponse(response), ToolJson);
    }

    [McpServerTool(Name = "action_search", Title = "Search actions"), Description(
        "Search persisted Quicker actions by title/description, or list recent actions when query is empty.")]
    public async Task<string> SearchActionSummariesAsync(
        [Description("Filter text; empty or whitespace lists recent actions.")] string? query = null,
        [Description("Max rows (default 30, max 200).")] int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .SearchActionSummariesAsync(query, maxResults ?? 30, linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(response, ToolJson);
    }

    [McpServerTool(Name = "step_runner_search", Title = "Search step runners"), Description(
        "Find StepRunner catalog rows for ActionStep.stepRunnerKey.")]
    public async Task<string> SearchStepRunnerModulesAsync(
        [Description("Filter keyword (whitespace = AND).")] string keyword,
        [Description("Max rows (default 40, max 200).")] int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .SearchStepRunnersAsync(keyword ?? string.Empty, maxResults, linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(response, ToolJson);
    }

    [McpServerTool(Name = "step_runner_get", Title = "Get step runner schema"), Description(
        "Schema to author ActionStep: stepRunnerKey, name, description, inputs/outputs.")]
    public async Task<string> GetStepRunnerDetailAsync(
        [Description("StepRunner Key property (same as ActionStep.stepRunnerKey).")] string stepRunnerKey,
        CancellationToken cancellationToken = default)
    {
        await using var session = await McpRpcBridge.ConnectAsync(_timeoutSeconds, _tryBootstrap, cancellationToken)
            .ConfigureAwait(false);
        var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(_timeoutSeconds);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, rpcToken);
        var response = await session.Proxy
            .GetStepRunnerDetailAsync(stepRunnerKey ?? string.Empty, linked.Token)
            .ConfigureAwait(false);
        return JsonSerializer.Serialize(ToMcpStepRunnerDetailResponse(response), ToolJson);
    }

    [McpServerTool(Name = "guide_get", Title = "Get authoring guide"), Description(
        "Returns Markdown guide for authoring Quicker XActions. Start with topic overview; read implementation-fallback " +
        "for expression/csscript priority and fallback when step_runner_search finds no module. step-runner-search for " +
        "keyword syntax. Then step-modules for common stepRunnerKey picks. Also: mcp-setup, " +
        "xaction-json, variables, expressions, patch-workflow.")]
    public Task<string> GetActionAuthoringDocAsync(
        [Description("Topic id (e.g. overview, patch-workflow, expressions).")] string topic,
        CancellationToken cancellationToken = default)
    {
        _ = cancellationToken;
        var response = _actionAuthoringGuide.GetDoc(topic);
        return Task.FromResult(JsonSerializer.Serialize(response, ToolJson));
    }

    [McpServerTool(Name = "guide_search", Title = "Search authoring guides"), Description(
        "Search Quicker action authoring guides by keyword (title/body). Empty keyword lists all topics. " +
        "Use guide_get to read full Markdown for a topic.")]
    public Task<string> SearchActionAuthoringDocsAsync(
        [Description("Filter text; whitespace lists all topics with excerpts.")] string? keyword = null,
        [Description("Max rows (default 10, max 50).")] int? maxResults = null,
        CancellationToken cancellationToken = default)
    {
        _ = cancellationToken;
        var response = _actionAuthoringGuide.Search(keyword, maxResults);
        return Task.FromResult(JsonSerializer.Serialize(response, ToolJson));
    }

    private static object ToMcpGetResponse(QuickerRpcGetCompressedActionResult response)
    {
        if (!response.Success || string.IsNullOrWhiteSpace(response.CompressedJson))
        {
            return new
            {
                response.Success,
                response.ErrorMessage,
                response.ActionId,
                response.EditVersion,
                response.ReturnMode,
            };
        }

        using var doc = JsonDocument.Parse(response.CompressedJson);
        return new
        {
            response.Success,
            response.ErrorMessage,
            response.ActionId,
            response.EditVersion,
            compressed = doc.RootElement.Clone(),
            response.OmitDefaultLiteralInputsApplied,
            response.SubProgramCount,
            response.ReturnMode,
        };
    }

    private static object ToMcpPatchResponse(QuickerRpcApplyActionPatchResult response)
    {
        return new
        {
            response.Success,
            response.ErrorMessage,
            response.ActionId,
            response.EditVersion,
            response.VersionConflict,
            updatedSteps = ParseJsonOrNull(response.UpdatedStepsJson),
            addedSteps = ParseJsonOrNull(response.AddedStepsJson),
            updatedVariables = ParseJsonOrNull(response.UpdatedVariablesJson),
            addedVariables = ParseJsonOrNull(response.AddedVariablesJson),
            response.UpdatedUtc,
        };
    }

    private static object ToMcpStepRunnerDetailResponse(QuickerRpcStepRunnerDetailResult response)
    {
        if (!response.Success || string.IsNullOrWhiteSpace(response.SchemaJson))
        {
            return new { response.Success, response.ErrorMessage };
        }

        using var doc = JsonDocument.Parse(response.SchemaJson);
        return new
        {
            response.Success,
            response.ErrorMessage,
            schema = doc.RootElement.Clone(),
        };
    }

    private static JsonElement? ParseJsonOrNull(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }
}
