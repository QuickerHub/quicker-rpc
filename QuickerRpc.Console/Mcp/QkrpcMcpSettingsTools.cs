using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpSettingsTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpSettingsTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "quicker_settings")]
    [Description("Headless Quicker settings + open UI. open: prefer preset (links) for one-step UI.")]
    public Task<string> QuickerSettings(
        string action,
        string? query = null,
        string? key = null,
        string? valueJson = null,
        string? page = null,
        string? preset = null,
        string? exe = null,
        string? searchText = null,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => _runtime.InvokeOpAsync(
                "settings.list",
                QkrpcMcpJson.ToElement(new { query = query?.Trim(), limit = 20 }),
                cancellationToken),
            "list" => _runtime.InvokeOpAsync(
                "settings.list",
                QkrpcMcpJson.ToElement(new { query = query?.Trim(), limit = 20 }),
                cancellationToken),
            "get" => string.IsNullOrWhiteSpace(key)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "key is required for get" }))
                : _runtime.InvokeOpAsync(
                    "settings.get",
                    QkrpcMcpJson.ToElement(new { key = key.Trim() }),
                    cancellationToken),
            "set" => string.IsNullOrWhiteSpace(key)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "key is required for set" }))
                : _runtime.InvokeOpAsync(
                    "settings.set",
                    BuildSettingsSetArgs(key, valueJson),
                    cancellationToken),
            "apply" => _runtime.InvokeOpAsync("settings.apply", default, cancellationToken),
            "pages" => _runtime.InvokeOpAsync("settings.pages", default, cancellationToken),
            "links" => _runtime.InvokeOpAsync("settings.links", default, cancellationToken),
            "open" => _runtime.InvokeOpAsync(
                "settings.open",
                QkrpcMcpJson.ToElement(new
                {
                    preset = preset?.Trim(),
                    page = page?.Trim(),
                    query = query?.Trim(),
                    key = key?.Trim(),
                    exe = exe?.Trim(),
                    searchText = searchText?.Trim(),
                }),
                cancellationToken),
            _ => Task.FromResult(QkrpcMcpJson.FormatObject(new
            {
                ok = false,
                errorMessage = "action must be search|list|get|set|apply|pages|links|open",
            })),
        };
    }

    private static System.Text.Json.JsonElement BuildSettingsSetArgs(string key, string? valueJson)
    {
        if (string.IsNullOrWhiteSpace(valueJson))
        {
            return QkrpcMcpJson.ToElement(new { key = key.Trim() });
        }

        return QkrpcMcpJson.ToElement(new
        {
            key = key.Trim(),
            value = QkrpcMcpJson.ParsePatchObject(valueJson),
        });
    }
}
