using System.ComponentModel;
using ModelContextProtocol.Server;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpTriggerTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpTriggerTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "quicker_trigger")]
    [Description("Quicker event trigger tasks (automation: run an action on window/process/clipboard/file/timer events). " +
                 "Always call action=events first to get exact eventType + param keys before add/update.")]
    public Task<string> QuickerTrigger(
        [Description("list | events | add | update | delete | enable | disable")] string action,
        [Description("Trigger task id (update/delete/enable/disable).")] string? id = null,
        [Description("Event type id, case sensitive (e.g. WindowActivated, ProcessStarted).")] string? eventType = null,
        [Description("Action id (Guid) or action title to run when triggered.")] string? actionIdOrName = null,
        [Description("Parameter passed to the action.")] string? actionParam = null,
        [Description("JSON object of event params (keys from action=events).")] string? paramsJson = null,
        [Description("Display note for the rule.")] string? note = null,
        [Description("Event filter expression evaluated against event variables.")] string? filter = null,
        [Description("list: filter by note/event/action/id keyword.")] string? query = null,
        [Description("update: enable (true) or disable (false) the rule.")] bool? enabled = null,
        [Description("Delay before running the action, milliseconds.")] int? delayMs = null,
        CancellationToken cancellationToken = default)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "list" => _runtime.InvokeOpAsync(
                "trigger.list",
                QkrpcMcpJson.ToElement(new { query = query?.Trim(), eventType = eventType?.Trim() }),
                cancellationToken),
            "events" => _runtime.InvokeOpAsync(
                "trigger.events",
                QkrpcMcpJson.ToElement(new { eventType = eventType?.Trim() }),
                cancellationToken),
            "add" or "update" => InvokeSave(verb, id, eventType, actionIdOrName, actionParam, paramsJson, note, filter, enabled, delayMs, cancellationToken),
            "delete" => string.IsNullOrWhiteSpace(id)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "id is required for delete" }))
                : _runtime.InvokeOpAsync(
                    "trigger.delete",
                    QkrpcMcpJson.ToElement(new { id = id.Trim() }),
                    cancellationToken),
            "enable" or "disable" => string.IsNullOrWhiteSpace(id)
                ? Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "id is required for enable/disable" }))
                : _runtime.InvokeOpAsync(
                    verb == "enable" ? "trigger.enable" : "trigger.disable",
                    QkrpcMcpJson.ToElement(new { id = id.Trim() }),
                    cancellationToken),
            _ => Task.FromResult(QkrpcMcpJson.FormatObject(new
            {
                ok = false,
                errorMessage = "action must be list|events|add|update|delete|enable|disable",
            })),
        };
    }

    private Task<string> InvokeSave(
        string verb,
        string? id,
        string? eventType,
        string? actionIdOrName,
        string? actionParam,
        string? paramsJson,
        string? note,
        string? filter,
        bool? enabled,
        int? delayMs,
        CancellationToken cancellationToken)
    {
        if (verb == "update" && string.IsNullOrWhiteSpace(id))
        {
            return Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "id is required for update" }));
        }

        if (verb == "add" && (string.IsNullOrWhiteSpace(eventType) || string.IsNullOrWhiteSpace(actionIdOrName)))
        {
            return Task.FromResult(QkrpcMcpJson.FormatObject(new
            {
                ok = false,
                errorMessage = "eventType and actionIdOrName are required for add (check action=events first)",
            }));
        }

        object? parsedParams = null;
        if (!string.IsNullOrWhiteSpace(paramsJson))
        {
            try
            {
                parsedParams = QkrpcMcpJson.ParsePatchObject(paramsJson);
            }
            catch (Exception ex)
            {
                return Task.FromResult(QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = "invalid paramsJson: " + ex.Message }));
            }
        }

        return _runtime.InvokeOpAsync(
            "trigger.save",
            QkrpcMcpJson.ToElement(new
            {
                id = verb == "update" ? id?.Trim() : null,
                eventType = eventType?.Trim(),
                action = actionIdOrName?.Trim(),
                actionParam,
                @params = parsedParams,
                note,
                filter,
                enabled,
                delayMs,
            }),
            cancellationToken);
    }
}
