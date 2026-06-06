using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpSettingsTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpSettingsTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "quicker_settings")]
    [Description("Headless Quicker app settings: search/list/get/set/apply. Use action=open only when user asks for UI.")]
    public Task<string> QuickerSettings(
        string action,
        string? query = null,
        string? key = null,
        string? valueJson = null,
        string? page = null,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "search" => _runtime.InvokeOpAsync(
                "settings.search",
                QkrpcMcpJson.ToElement(new { query = query?.Trim(), limit = 20 }),
                cancellationToken),
            "list" => _runtime.InvokeOpAsync(
                "settings.list",
                QkrpcMcpJson.ToElement(new { page = page?.Trim() }),
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
            "open" => _runtime.InvokeOpAsync(
                "settings.open",
                QkrpcMcpJson.ToElement(new { page = string.IsNullOrWhiteSpace(page) ? "AppSettings" : page.Trim() }),
                cancellationToken),
            _ => Task.FromResult(QkrpcMcpJson.FormatObject(new
            {
                ok = false,
                errorMessage = "action must be search|list|get|set|apply|pages|open",
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
