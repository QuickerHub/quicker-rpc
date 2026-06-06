using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Server;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpActionTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpActionTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_action")]
    [Description(
        "Quicker local actions: list/search/get/create/replace/patch/publish/set_metadata/float/edit/edit_var/run/move; "
        + "global profile tabs (profile_create/delete/prune/reorder); virtual process pages (process_ensure). "
        + "Disk editing: set QKRPC_WORKSPACE_ROOT, read .quicker/README.md, edit data.json/files with file tools, qkrpc_sync push. "
        + "pull: qkrpc_sync pull. Destructive delete: qkrpc_action_delete.")]
    public async Task<string> QkrpcAction(
        string action,
        string? query = null,
        string? filter = null,
        string? fields = null,
        string? scope = null,
        int? limit = null,
        string? sort = null,
        string? id = null,
        string? returnMode = null,
        string? title = null,
        string? description = null,
        string? icon = null,
        string? profileId = null,
        string? patchJson = null,
        string? xactionJson = null,
        long? expectedEditVersion = null,
        bool force = false,
        string? note = null,
        string? tags = null,
        string? keywords = null,
        string? changelog = null,
        bool? isPublic = null,
        bool? submitReview = null,
        string? var = null,
        string? value = null,
        string? param = null,
        bool wait = false,
        bool debug = false,
        string? profile = null,
        int? row = null,
        int? col = null,
        bool swap = false,
        string? onNoEmptySlot = null,
        string? onOccupiedSlot = null,
        int? count = null,
        bool afterFirst = false,
        string? profileIds = null,
        string? exeFile = null,
        string? displayName = null,
        string? profileNamePrefix = null,
        string? collectSubProgramName = null,
        bool moveActions = false,
        bool moveAny = false,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        switch (verb)
        {
            case "list":
            {
                if (!ActionQueryFilter.TryNormalizeFilter(filter, out _, out var filterError))
                {
                    return ValidationError(filterError ?? "Invalid filter.");
                }

                var mergedQuery = ActionQueryFilter.MergeFilter(filter, query);
                if (!ActionSummaryFieldCatalog.TryParseCsv(fields, out var parsedFields, out var fieldsError))
                {
                    return ValidationError(fieldsError ?? "Invalid fields.");
                }

                if (parsedFields.Count > 0)
                {
                    mergedQuery = ActionQueryFilter.MergeFields(parsedFields, mergedQuery);
                }

                var args = new Dictionary<string, object?>();
                if (!string.IsNullOrWhiteSpace(mergedQuery)) args["query"] = mergedQuery.Trim();
                if (!string.IsNullOrWhiteSpace(filter)) args["filter"] = filter.Trim();
                if (!string.IsNullOrWhiteSpace(fields)) args["fields"] = fields.Trim();
                if (!string.IsNullOrWhiteSpace(scope)) args["scope"] = scope.Trim();
                args["limit"] = limit ?? 30;
                args["sort"] = string.IsNullOrWhiteSpace(sort)
                    ? (string.IsNullOrWhiteSpace(mergedQuery) ? "lastEdit" : "relevance")
                    : sort.Trim();
                return await _runtime.InvokeOpAsync("action.list", QkrpcMcpJson.ToElement(args), cancellationToken)
                    .ConfigureAwait(false);
            }
            case "search":
            {
                if (!ActionQueryFilter.TryNormalizeFilter(filter, out _, out var searchFilterError))
                {
                    return ValidationError(searchFilterError ?? "Invalid filter.");
                }

                var mergedSearchQuery = ActionQueryFilter.MergeFilter(filter, query);
                if (!ActionSummaryFieldCatalog.TryParseCsv(fields, out var searchFields, out var searchFieldsError))
                {
                    return ValidationError(searchFieldsError ?? "Invalid fields.");
                }

                if (searchFields.Count > 0)
                {
                    mergedSearchQuery = ActionQueryFilter.MergeFields(searchFields, mergedSearchQuery);
                }

                var searchArgs = new Dictionary<string, object?>();
                if (!string.IsNullOrWhiteSpace(mergedSearchQuery)) searchArgs["query"] = mergedSearchQuery.Trim();
                if (!string.IsNullOrWhiteSpace(filter)) searchArgs["filter"] = filter.Trim();
                if (!string.IsNullOrWhiteSpace(fields)) searchArgs["fields"] = fields.Trim();
                if (!string.IsNullOrWhiteSpace(scope)) searchArgs["scope"] = scope.Trim();
                searchArgs["limit"] = limit ?? 30;
                searchArgs["sort"] = string.IsNullOrWhiteSpace(sort)
                    ? (string.IsNullOrWhiteSpace(mergedSearchQuery) ? "lastEdit" : "relevance")
                    : sort.Trim();
                return await _runtime.InvokeOpAsync("action.list", QkrpcMcpJson.ToElement(searchArgs), cancellationToken)
                    .ConfigureAwait(false);
            }
            case "get":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for get");
                }

                return await _runtime.InvokeOpAsync(
                    "action.get",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        returnMode = string.IsNullOrWhiteSpace(returnMode) ? "structure" : returnMode.Trim(),
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "create":
                return await _runtime.InvokeOpAsync(
                    "action.create",
                    QkrpcMcpJson.ToElement(new
                    {
                        title,
                        description,
                        icon,
                        profileId = string.IsNullOrWhiteSpace(profileId) ? null : profileId.Trim(),
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "patch":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for patch");
                }

                if (string.IsNullOrWhiteSpace(patchJson))
                {
                    return ValidationError("patchJson is required for patch");
                }

                try
                {
                    var patch = QkrpcMcpJson.ParsePatchObject(patchJson);
                    return await _runtime.InvokeOpAsync(
                        "action.patch",
                        QkrpcMcpJson.ToElement(new
                        {
                            id = id.Trim(),
                            patch,
                            expectedEditVersion,
                            force,
                        }),
                        cancellationToken).ConfigureAwait(false);
                }
                catch (JsonException ex)
                {
                    return ValidationError("invalid patchJson: " + ex.Message);
                }
            case "replace":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for replace");
                }

                if (string.IsNullOrWhiteSpace(xactionJson))
                {
                    return ValidationError("xactionJson is required for replace");
                }

                try
                {
                    var program = QkrpcMcpJson.ParsePatchObject(xactionJson);
                    return await _runtime.InvokeOpAsync(
                        "action.replace",
                        QkrpcMcpJson.ToElement(new
                        {
                            id = id.Trim(),
                            xaction = program,
                            expectedEditVersion,
                            force,
                        }),
                        cancellationToken).ConfigureAwait(false);
                }
                catch (JsonException ex)
                {
                    return ValidationError("invalid xactionJson: " + ex.Message);
                }
            case "publish":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for publish");
                }

                return await _runtime.InvokeOpAsync(
                    "action.publish",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        title,
                        description,
                        shareNote = note,
                        tags,
                        keywords,
                        changelog,
                        isPublic,
                        submitReview,
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "set_metadata":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for set_metadata");
                }

                return await _runtime.InvokeOpAsync(
                    "action.set-metadata",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        title,
                        description,
                        icon,
                        expectedEditVersion,
                        force,
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "float":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for float");
                }

                return await _runtime.InvokeOpAsync(
                    "action.float",
                    QkrpcMcpJson.ToElement(new { id = id.Trim() }),
                    cancellationToken).ConfigureAwait(false);
            case "edit":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for edit");
                }

                return await _runtime.InvokeOpAsync(
                    "action.edit",
                    QkrpcMcpJson.ToElement(new { id = id.Trim() }),
                    cancellationToken).ConfigureAwait(false);
            case "edit_var":
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(var) || value is null)
                {
                    return ValidationError("id, var, and value are required for edit_var");
                }

                return await _runtime.InvokeOpAsync(
                    "action.edit-var",
                    QkrpcMcpJson.ToElement(new { id = id.Trim(), var = var.Trim(), value }),
                    cancellationToken).ConfigureAwait(false);
            case "run":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for run");
                }

                return await _runtime.InvokeOpAsync(
                    "action.run",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        param,
                        wait,
                        debug,
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "move":
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(profile))
                {
                    return ValidationError("id and profile are required for move");
                }

                return await _runtime.InvokeOpAsync(
                    "action.move",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        profile = profile.Trim(),
                        row,
                        col,
                        swap,
                        onNoEmptySlot = NormalizeMoveSlot(onNoEmptySlot),
                        onOccupiedSlot = onOccupiedSlot?.Trim(),
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "profile_create":
                return await _runtime.InvokeOpAsync(
                    "profile.create",
                    QkrpcMcpJson.ToElement(new
                    {
                        scope = "global",
                        count = count ?? 1,
                        afterFirst,
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "profile_delete":
            {
                var ids = ParseProfileIds(profileIds, profileId, id);
                if (ids.Count == 0)
                {
                    return ValidationError("profileIds or id is required for profile_delete");
                }

                return await _runtime.InvokeOpAsync(
                    "profile.delete",
                    QkrpcMcpJson.ToElement(new { profileIds = ids }),
                    cancellationToken).ConfigureAwait(false);
            }
            case "profile_prune":
            {
                var pruneScope = !string.IsNullOrWhiteSpace(scope)
                    ? scope.Trim()
                    : !string.IsNullOrWhiteSpace(exeFile)
                        ? exeFile.Trim()
                        : string.Empty;
                if (pruneScope.Length == 0)
                {
                    return ValidationError("scope or exeFile is required for profile_prune");
                }

                return await _runtime.InvokeOpAsync(
                    "profile.prune",
                    QkrpcMcpJson.ToElement(new { scope = pruneScope }),
                    cancellationToken).ConfigureAwait(false);
            }
            case "profile_reorder":
            {
                var ids = ParseProfileIds(profileIds, profileId, id);
                if (ids.Count == 0)
                {
                    return ValidationError("profileIds is required for profile_reorder");
                }

                return await _runtime.InvokeOpAsync(
                    "profile.reorder",
                    QkrpcMcpJson.ToElement(new
                    {
                        scope = "global",
                        afterFirst = true,
                        profileIds = ids,
                    }),
                    cancellationToken).ConfigureAwait(false);
            }
            case "process_ensure":
                if (string.IsNullOrWhiteSpace(exeFile)
                    || string.IsNullOrWhiteSpace(displayName)
                    || string.IsNullOrWhiteSpace(profileNamePrefix))
                {
                    return ValidationError("exeFile, displayName, and profileNamePrefix are required");
                }

                return await _runtime.InvokeOpAsync(
                    "process.ensure",
                    QkrpcMcpJson.ToElement(new
                    {
                        exeFile = exeFile.Trim(),
                        displayName = displayName.Trim(),
                        profileNamePrefix = profileNamePrefix.Trim(),
                        moveActions,
                        collectSubProgramName = collectSubProgramName?.Trim(),
                        moveAny,
                    }),
                    cancellationToken).ConfigureAwait(false);
            default:
                return ValidationError("Unknown action: " + action);
        }
    }

    [McpServerTool(Name = "qkrpc_action_delete")]
    [Description("Permanently delete a local Quicker action. Destructive — only when the user explicitly asked to delete.")]
    public Task<string> QkrpcActionDelete(string id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return _runtime.InvokeOpAsync(
            "action.delete",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), yes = true }),
            cancellationToken);
    }

    private static string ValidationError(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });

    private static string? NormalizeMoveSlot(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().Equals("createPageAfter", StringComparison.OrdinalIgnoreCase)
            ? "create-page-after"
            : value.Trim();
    }

    private static List<string> ParseProfileIds(string? profileIds, string? profileId, string? id)
    {
        if (!string.IsNullOrWhiteSpace(profileIds))
        {
            return profileIds
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(profileId))
        {
            return [profileId.Trim()];
        }

        if (!string.IsNullOrWhiteSpace(id))
        {
            return [id.Trim()];
        }

        return [];
    }
}
