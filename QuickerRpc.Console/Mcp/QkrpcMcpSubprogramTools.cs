using System.ComponentModel;
using System.Text.Json;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpSubprogramTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpSubprogramTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_subprogram")]
    [Description(
        "Global subprograms: list/search/get/create/patch/replace/export/import/edit/edit_var. "
        + "Before calling in steps use get for callIdentifier, then qkrpc_step_runner_get with key sys:subprogram.")]
    public async Task<string> QkrpcSubprogram(
        string action,
        string? query = null,
        int? limit = null,
        string? id = null,
        string? returnMode = null,
        string? name = null,
        string? description = null,
        string? icon = null,
        string? patchJson = null,
        string? programJson = null,
        long? expectedEditVersion = null,
        bool force = false,
        string? dir = null,
        string? var = null,
        string? value = null,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        switch (verb)
        {
            case "list":
                return await _runtime.InvokeOpAsync(
                    "subprogram.list",
                    QkrpcMcpJson.ToElement(new
                    {
                        query = string.IsNullOrWhiteSpace(query) ? null : query.Trim(),
                        limit = limit ?? 30,
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "search":
                if (string.IsNullOrWhiteSpace(query))
                {
                    return ValidationError("query is required for search");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.search",
                    QkrpcMcpJson.ToElement(new { query = query.Trim(), limit = limit ?? 30 }),
                    cancellationToken).ConfigureAwait(false);
            case "get":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for get");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.get",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        returnMode = string.IsNullOrWhiteSpace(returnMode) ? "structure" : returnMode.Trim(),
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "create":
                if (string.IsNullOrWhiteSpace(name))
                {
                    return ValidationError("name is required for create");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.create",
                    QkrpcMcpJson.ToElement(new { name = name.Trim(), description, icon }),
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
                        "subprogram.patch",
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

                if (string.IsNullOrWhiteSpace(programJson))
                {
                    return ValidationError("programJson is required for replace");
                }

                try
                {
                    var program = QkrpcMcpJson.ParsePatchObject(programJson);
                    return await _runtime.InvokeOpAsync(
                        "subprogram.replace",
                        QkrpcMcpJson.ToElement(new
                        {
                            id = id.Trim(),
                            program,
                            expectedEditVersion,
                            force,
                        }),
                        cancellationToken).ConfigureAwait(false);
                }
                catch (JsonException ex)
                {
                    return ValidationError("invalid programJson: " + ex.Message);
                }
            case "export":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for export");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.export",
                    QkrpcMcpJson.ToElement(new
                    {
                        id = id.Trim(),
                        dir = string.IsNullOrWhiteSpace(dir) ? null : dir.Trim(),
                    }),
                    cancellationToken).ConfigureAwait(false);
            case "import":
                if (string.IsNullOrWhiteSpace(dir))
                {
                    return ValidationError("dir is required for import");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.import",
                    QkrpcMcpJson.ToElement(new { dir = dir.Trim() }),
                    cancellationToken).ConfigureAwait(false);
            case "edit":
                if (string.IsNullOrWhiteSpace(id))
                {
                    return ValidationError("id is required for edit");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.edit",
                    QkrpcMcpJson.ToElement(new { id = id.Trim() }),
                    cancellationToken).ConfigureAwait(false);
            case "edit_var":
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(var) || value is null)
                {
                    return ValidationError("id, var, and value are required for edit_var");
                }

                return await _runtime.InvokeOpAsync(
                    "subprogram.edit-var",
                    QkrpcMcpJson.ToElement(new { id = id.Trim(), var = var.Trim(), value }),
                    cancellationToken).ConfigureAwait(false);
            default:
                return ValidationError("Unknown action: " + action);
        }
    }

    [McpServerTool(Name = "qkrpc_subprogram_delete")]
    [Description("Permanently delete a global subprogram. Destructive — only when the user explicitly asked to delete.")]
    public Task<string> QkrpcSubprogramDelete(string id, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(ValidationError("id is required"));
        }

        return _runtime.InvokeOpAsync(
            "subprogram.delete",
            QkrpcMcpJson.ToElement(new { id = id.Trim(), yes = true }),
            cancellationToken);
    }

    private static string ValidationError(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });
}
