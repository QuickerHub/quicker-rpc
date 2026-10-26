using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpCatalogTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpCatalogTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_step_runner_search")]
    [Description(
        "Search Quicker step modules. Space = AND (auto OR fallback when empty); | branches; * wildcard. Returns controlField hints — do not guess inputs keys.")]
    public Task<string> QkrpcStepRunnerSearch(
        string query,
        int? limit = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "query is required" }));
        }

        return _runtime.InvokeOpAsync(
            "step-runner.search",
            QkrpcMcpJson.ToElement(new { query = query.Trim(), limit = limit ?? 20 }),
            cancellationToken);
    }

    [McpServerTool(Name = "qkrpc_step_runner_get")]
    [Description(
        "Get compressed step-runner schema for Agent editing (inputs keys). "
        + "Write data.json steps with short wire: key / inputs / outputs. "
        + "inputs values: paramKey / paramKey.file / paramKey.var. Never stepKey. Never step-runner.getUi. Always search first for controlField.")]
    public Task<string> QkrpcStepRunnerGet(
        string key,
        string? controlField = null,
        CancellationToken cancellationToken = default,
        [Description("Optional current schema page: {pointer,mode:children|value,offset,expectedObservation}. Requires an existing host binding; never bootstraps. Values are raw JSON text fragments.")]
        StepRunnerSchemaReadOptions? read = null)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "key is required" }));
        }

        return _runtime.InvokeOpAsync(
            "step-runner.get",
            QkrpcMcpJson.ToElement(new
            {
                key = key.Trim(),
                controlField,
                read,
            }),
            cancellationToken);
    }

    [McpServerTool(Name = "qkrpc_step_runner_input_contract")]
    [Description("Read explicit native input policies for a connected host. Use before editing live step inputs; unknown facts remain blocked. This is not a UI schema and does not grant a document edit scope. Missing controlField uses only a proven native default; an explicit empty string remains distinct.")]
    public Task<string> QkrpcStepRunnerInputContract(
        string key, string? controlField = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "key is required" }));
        return _runtime.InvokeOpAsync("step-runner.input-contract",
            QkrpcMcpJson.ToElement(new { key = key.Trim(), controlField }), cancellationToken);
    }

    [McpServerTool(Name = "qkrpc_fa")]
    [Description("Search or resolve Font Awesome icon specs (fa:Light_Name). Use before set_metadata icon.")]
    public Task<string> QkrpcFa(
        string action,
        string? query = null,
        string? spec = null,
        int? limit = null,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => string.IsNullOrWhiteSpace(query)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "query is required for search" }))
                : _runtime.InvokeOpAsync(
                    "fa.search",
                    QkrpcMcpJson.ToElement(new { query = query.Trim(), limit = limit ?? 20 }),
                    cancellationToken),
            "resolve" => string.IsNullOrWhiteSpace(spec)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "spec is required for resolve" }))
                : _runtime.InvokeOpAsync(
                    "fa.resolve",
                    QkrpcMcpJson.ToElement(new { spec = spec.Trim() }),
                    cancellationToken),
            _ => Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "action must be search or resolve" })),
        };
    }
}
