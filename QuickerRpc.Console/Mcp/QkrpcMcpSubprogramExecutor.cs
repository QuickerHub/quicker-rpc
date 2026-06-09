namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpSubprogramExecutor
{
    internal const string WorkspaceRedirect =
        "Edit .quicker/subprograms/ on disk with host file tools, then workspace_program patch — not subprogram patch/replace.";

    internal static string ValidationError(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });

    internal static Task<string> QueryAsync(
        QkrpcMcpRuntime runtime,
        string? query,
        int? limit,
        CancellationToken cancellationToken) =>
        runtime.InvokeOpAsync(
            "subprogram.list",
            QkrpcMcpJson.ToElement(new
            {
                query = string.IsNullOrWhiteSpace(query) ? null : query.Trim(),
                limit = limit ?? 30,
            }),
            cancellationToken);

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
            "subprogram.get",
            QkrpcMcpJson.ToElement(new
            {
                id = id.Trim(),
                returnMode = string.IsNullOrWhiteSpace(returnMode) ? "structure" : returnMode.Trim(),
            }),
            cancellationToken).ConfigureAwait(false);

        return await QkrpcMcpWorkspaceSync.AugmentSubprogramGetAsync(runtime, id.Trim(), getJson, cancellationToken)
            .ConfigureAwait(false);
    }

    internal static Task<string> CreateAsync(
        QkrpcMcpRuntime runtime,
        string name,
        string? description,
        string? icon,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Task.FromResult(ValidationError("name is required"));
        }

        return runtime.InvokeOpAsync(
            "subprogram.create",
            QkrpcMcpJson.ToElement(new { name = name.Trim(), description, icon }),
            cancellationToken);
    }

    internal static Task<string> ExportAsync(
        QkrpcMcpRuntime runtime,
        string id,
        string dir,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(dir))
        {
            return Task.FromResult(ValidationError("id and dir are required"));
        }

        return runtime.InvokeOpAsync(
            "subprogram.export",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), dir = dir.Trim() }),
            cancellationToken);
    }

    internal static Task<string> ImportAsync(
        QkrpcMcpRuntime runtime,
        string dir,
        long? expectedEditVersion,
        bool force,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(dir))
        {
            return Task.FromResult(ValidationError("dir is required"));
        }

        return runtime.InvokeOpAsync(
            "subprogram.import",
            QkrpcMcpJson.ToElement(new
            {
                dir = dir.Trim(),
                expectedEditVersion,
                force,
            }),
            cancellationToken);
    }

    internal static Task<string> EditAsync(QkrpcMcpRuntime runtime, string id, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return runtime.InvokeOpAsync(
            "subprogram.edit",
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
            "subprogram.delete",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), yes = true }),
            cancellationToken);
    }

}
