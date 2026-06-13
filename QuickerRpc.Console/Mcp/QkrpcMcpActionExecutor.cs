using System.Text.Json;
using System.Text.Json.Nodes;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpActionExecutor
{
    internal const string WorkspaceRedirect =
        "Edit .quicker/ on disk with host file tools, then workspace_program patch — not action patch/replace.";

    internal static string ValidationError(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });

    internal static Task<string> QueryAsync(
        QkrpcMcpRuntime runtime,
        string? query,
        string? filter,
        string? fields,
        string? scope,
        int? limit,
        string? sort,
        CancellationToken cancellationToken)
    {
        if (!ActionQueryFilter.TryNormalizeFilter(filter, out _, out var filterError))
        {
            return Task.FromResult(ValidationError(filterError ?? "Invalid filter."));
        }

        var mergedQuery = ActionQueryFilter.MergeFilter(filter, query);
        if (!ActionSummaryFieldCatalog.TryParseCsv(fields, out var parsedFields, out var fieldsError))
        {
            return Task.FromResult(ValidationError(fieldsError ?? "Invalid fields."));
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
        return runtime.InvokeOpAsync("action.list", QkrpcMcpJson.ToElement(args), cancellationToken);
    }

    internal static async Task<string> GetAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? returnMode,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return ValidationError("id is required");
        }

        var getJson = await runtime.InvokeOpAsync(
            "action.get",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                returnMode = string.IsNullOrWhiteSpace(returnMode) ? "structure" : returnMode.Trim(),
            }),
            cancellationToken).ConfigureAwait(false);

        return await QkrpcMcpWorkspaceSync.AugmentActionGetAsync(runtime, id.Trim(), getJson, cancellationToken)
            .ConfigureAwait(false);
    }

    internal static Task<string> SharedGetAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? returnMode,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.shared.get",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                returnMode = string.IsNullOrWhiteSpace(returnMode) ? "full" : returnMode.Trim(),
            }),
            cancellationToken);
    }

    internal static Task<string> LibrarySearchAsync(
        QkrpcMcpRuntime runtime,
        string keyword,
        int? page,
        int? days,
        int? limit,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(keyword))
        {
            return Task.FromResult(ValidationError("keyword is required"));
        }

        return runtime.InvokeOpAsync(
            "action.library.search",
            QkrpcMcpJson.ToElement(new
            {
                keyword = keyword.Trim(),
                page = page ?? 1,
                days,
                limit = limit ?? 20,
            }),
            cancellationToken);
    }

    internal static async Task<string> CreateAsync(
        QkrpcMcpRuntime runtime,
        string title,
        string? description,
        string? icon,
        string? profileId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return ValidationError("title is required");
        }

        var createJson = await runtime.InvokeOpAsync(
            "action.create",
            QkrpcMcpJson.ToElement(new
            {
                title = title.Trim(),
                description,
                icon,
                profileId = string.IsNullOrWhiteSpace(profileId) ? null : profileId.Trim(),
            }),
            cancellationToken).ConfigureAwait(false);

        return await QkrpcMcpWorkspaceSync.AugmentActionCreateAsync(runtime, createJson, cancellationToken)
            .ConfigureAwait(false);
    }

    internal static Task<string> EditAsync(QkrpcMcpRuntime runtime, string id, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.edit",
            QkrpcMcpJson.ToElement(new { id = id.Trim() }),
            cancellationToken);
    }

    internal static Task<string> EditVarAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string var,
        string value,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(var))
        {
            return Task.FromResult(ValidationError("id and var are required"));
        }

        return runtime.InvokeOpAsync(
            "action.edit-var",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), var = var.Trim(), value }),
            cancellationToken);
    }

    internal static Task<string> SetMetadataAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? title,
        string? description,
        string? icon,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
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
            cancellationToken);
    }

    internal static Task<string> MoveAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string profile,
        int? row,
        int? col,
        bool swap,
        string? onNoEmptySlot,
        string? onOccupiedSlot,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(profile))
        {
            return Task.FromResult(ValidationError("id and profile are required"));
        }

        return runtime.InvokeOpAsync(
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
            cancellationToken);
    }

    internal static Task<string> PublishAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? title,
        string? description,
        string? note,
        string? html,
        string? tags,
        string? keywords,
        string? changelog,
        bool? isPublic,
        bool? submitReview,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.publish",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                title,
                description,
                shareNote = note,
                html,
                tags,
                keywords,
                changelog,
                isPublic,
                submitReview,
            }),
            cancellationToken);
    }

    internal static Task<string> RunAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? param = null,
        bool wait = false,
        string? mode = null,
        string? mockProfile = null,
        string? mockProfileFile = null,
        bool assert = false,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        var mock = string.Equals(mode, "mock", StringComparison.OrdinalIgnoreCase);
        return runtime.InvokeOpAsync(
            "action.run",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                param,
                wait,
                debug = false,
                trace = false,
                mock,
                mode,
                mockProfile,
                mockProfileFile,
                assert,
            }),
            cancellationToken);
    }

    internal static Task<string> DebugAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string? param,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.run",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                param,
                trace = true,
            }),
            cancellationToken);
    }

    internal static Task<string> FloatAsync(QkrpcMcpRuntime runtime, string id, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.float",
            QkrpcMcpJson.ToElement(new { id = id.Trim() }),
            cancellationToken);
    }

    internal static Task<string> DeleteAsync(QkrpcMcpRuntime runtime, string id, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "action.delete",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), yes = true }),
            cancellationToken);
    }

    internal static Task<string> ProfileCreateAsync(
        QkrpcMcpRuntime runtime,
        int? count,
        bool afterFirst,
        CancellationToken cancellationToken) =>
        runtime.InvokeOpAsync(
            "profile.create",
            QkrpcMcpJson.ToElement(new { scope = "global", count = count ?? 1, afterFirst }),
            cancellationToken);

    internal static Task<string> ProfileDeleteAsync(
        QkrpcMcpRuntime runtime,
        string? profileIds,
        string? profileId,
        string? id,
        CancellationToken cancellationToken)
    {
        var ids = ParseProfileIds(profileIds, profileId, id);
        if (ids.Count == 0)
        {
            return Task.FromResult(ValidationError("profileIds or id is required"));
        }

        return runtime.InvokeOpAsync(
            "profile.delete",
            QkrpcMcpJson.ToElement(new { profileIds = ids }),
            cancellationToken);
    }

    internal static Task<string> ProfilePruneAsync(
        QkrpcMcpRuntime runtime,
        string? scope,
        string? exeFile,
        CancellationToken cancellationToken)
    {
        var pruneScope = !string.IsNullOrWhiteSpace(scope)
            ? scope.Trim()
            : !string.IsNullOrWhiteSpace(exeFile)
                ? exeFile.Trim()
                : string.Empty;
        if (pruneScope.Length == 0)
        {
            return Task.FromResult(ValidationError("scope or exeFile is required"));
        }

        return runtime.InvokeOpAsync(
            "profile.prune",
            QkrpcMcpJson.ToElement(new { scope = pruneScope }),
            cancellationToken);
    }

    internal static Task<string> ProfileReorderAsync(
        QkrpcMcpRuntime runtime,
        string? profileIds,
        CancellationToken cancellationToken)
    {
        var ids = ParseProfileIds(profileIds, null, null);
        if (ids.Count == 0)
        {
            return Task.FromResult(ValidationError("profileIds is required"));
        }

        return runtime.InvokeOpAsync(
            "profile.reorder",
            QkrpcMcpJson.ToElement(new { scope = "global", afterFirst = true, profileIds = ids }),
            cancellationToken);
    }

    internal static Task<string> ProcessEnsureAsync(
        QkrpcMcpRuntime runtime,
        string exeFile,
        string displayName,
        string profileNamePrefix,
        string? collectSubProgramName,
        bool moveActions,
        bool moveAny,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(exeFile)
            || string.IsNullOrWhiteSpace(displayName)
            || string.IsNullOrWhiteSpace(profileNamePrefix))
        {
            return Task.FromResult(ValidationError("exeFile, displayName, and profileNamePrefix are required"));
        }

        return runtime.InvokeOpAsync(
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
            cancellationToken);
    }

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
