using System.Text.Json;
using CommandLine;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private const string TriggerUsageHint =
        "Use: trigger list|events|add|update|delete|enable|disable. " +
        "add: --event <EventType> --action <idOrName> [--params '{...}']; see qkrpc trigger events --json.";

    private static Task<int> RunTriggerFromArgsAsync(string[] args)
    {
        if (args.Length < 2)
        {
            return EmitErrorAndFailAsync(
                args.Any(a => string.Equals(a, "--json", StringComparison.OrdinalIgnoreCase)),
                "TRIGGER_PARSE_ERROR",
                TriggerUsageHint);
        }

        var triggerArgs = args[1..];
        return Parser.Default.ParseArguments<TriggerOptions>(triggerArgs)
            .MapResult(
                (TriggerOptions o) => RunTriggerCommandAsync(o),
                _ => EmitErrorAndFailAsync(
                    triggerArgs.Any(a => string.Equals(a, "--json", StringComparison.OrdinalIgnoreCase)),
                    "TRIGGER_PARSE_ERROR",
                    TriggerUsageHint));
    }

    private static Task<int> RunTriggerCommandAsync(TriggerOptions options)
    {
        var verb = (options.Command ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "list" => RunTriggerListAsync(options),
            "events" => RunTriggerEventsAsync(options),
            "add" => RunTriggerSaveAsync(options, isUpdate: false),
            "update" => RunTriggerSaveAsync(options, isUpdate: true),
            "delete" => RunTriggerDeleteAsync(options),
            "enable" => RunTriggerSetEnabledAsync(options, enabled: true),
            "disable" => RunTriggerSetEnabledAsync(options, enabled: false),
            _ => EmitErrorAndFailAsync(options.Json, "UNKNOWN_TRIGGER_VERB", TriggerUsageHint),
        };
    }

    private static async Task<int> RunTriggerListAsync(TriggerOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .ListTriggersAsync(options.Query, options.EventType, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "trigger-list",
                        totalCount = result.TotalCount,
                        items = result.Items,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                if (result.Items.Count == 0)
                {
                    global::System.Console.WriteLine("no trigger tasks.");
                }

                foreach (var item in result.Items)
                {
                    var state = item.IsEnabled == true ? "on " : "off";
                    var action = item.ActionTitle ?? item.ActionIdOrName;
                    global::System.Console.WriteLine(
                        $"[{state}] {item.Id}  {item.EventType}  ->  {action}  {item.Note}");
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message ?? "trigger list failed.");
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "TRIGGER_LIST_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunTriggerEventsAsync(TriggerOptions options)
    {
        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .ListTriggerEventTypesAsync(options.EventType, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "trigger-events",
                        source = result.Source,
                        items = result.Items,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                foreach (var item in result.Items)
                {
                    var fields = string.Join(", ", item.Fields.Select(f => f.Key));
                    global::System.Console.WriteLine(
                        $"{item.EventType}\t{item.Description}" + (fields.Length > 0 ? $"\t[{fields}]" : string.Empty));
                }
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message ?? "trigger events failed.");
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "TRIGGER_EVENTS_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunTriggerSaveAsync(TriggerOptions options, bool isUpdate)
    {
        if (isUpdate && string.IsNullOrWhiteSpace(options.Id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <guid> for trigger update.")
                .ConfigureAwait(false);
        }

        if (!isUpdate && !string.IsNullOrWhiteSpace(options.Id))
        {
            return await EmitErrorAndFailAsync(options.Json, "UNEXPECTED_ID", "trigger add does not take --id; use trigger update.")
                .ConfigureAwait(false);
        }

        string? paramsJson;
        try
        {
            paramsJson = ResolveTriggerParamsJson(options);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "INVALID_PARAMS", ex.Message).ConfigureAwait(false);
        }

        var payload = new QuickerRpcTriggerTaskInfo
        {
            Id = options.Id?.Trim() ?? string.Empty,
            EventType = options.EventType,
            ActionIdOrName = options.Action,
            ActionParam = options.ActionParam,
            Note = options.Note,
            ParamsJson = paramsJson,
            EventFilterExpression = options.Filter,
            ValidForMachines = options.Machines,
            DebounceMs = options.DebounceMs,
            ThrottleMs = options.ThrottleMs,
            DelayMs = options.DelayMs,
            SkipFurtherTasks = options.SkipFurther ? true : null,
            IsEnabled = options.Disabled ? false : options.Enabled ? true : null,
        };

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.SaveTriggerAsync(payload, rpcToken).ConfigureAwait(false);
            return await EmitTriggerSaveResultAsync(options.Json, isUpdate ? "trigger-update" : "trigger-add", result)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "TRIGGER_SAVE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunTriggerSetEnabledAsync(TriggerOptions options, bool enabled)
    {
        if (string.IsNullOrWhiteSpace(options.Id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <guid>.").ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .SetTriggerEnabledAsync(options.Id.Trim(), enabled, rpcToken)
                .ConfigureAwait(false);
            return await EmitTriggerSaveResultAsync(options.Json, enabled ? "trigger-enable" : "trigger-disable", result)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "TRIGGER_SAVE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> RunTriggerDeleteAsync(TriggerOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Id))
        {
            return await EmitErrorAndFailAsync(options.Json, "MISSING_ID", "Provide --id <guid>.").ConfigureAwait(false);
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy.DeleteTriggerAsync(options.Id.Trim(), rpcToken).ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(
                    new
                    {
                        ok = result.Ok,
                        action = "trigger-delete",
                        id = result.Id,
                        message = result.Message,
                    },
                    QkrpcJson.CliOutput));
            }
            else if (result.Ok)
            {
                global::System.Console.WriteLine($"deleted {result.Id}");
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message ?? "trigger delete failed.");
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            return await EmitErrorAndFailAsync(options.Json, "TRIGGER_DELETE_FAILED", ex.Message).ConfigureAwait(false);
        }
    }

    private static async Task<int> EmitTriggerSaveResultAsync(
        bool json,
        string action,
        QuickerRpcTriggerSaveResult result)
    {
        if (json)
        {
            global::System.Console.WriteLine(JsonSerializer.Serialize(
                new
                {
                    ok = result.Ok,
                    action,
                    created = result.Created,
                    task = result.Task,
                    warnings = result.Warnings,
                    message = result.Message,
                },
                QkrpcJson.CliOutput));
        }
        else if (result.Ok)
        {
            var verb = result.Created ? "created" : "updated";
            global::System.Console.WriteLine($"{verb} {result.Task?.Id} ({result.Task?.EventType} -> {result.Task?.ActionIdOrName})");
            foreach (var warning in result.Warnings)
            {
                global::System.Console.WriteLine("warning: " + warning);
            }
        }
        else
        {
            global::System.Console.Error.WriteLine(result.Message ?? "trigger save failed.");
        }

        await Task.CompletedTask.ConfigureAwait(false);
        return result.Ok ? ExitCodes.Success : ExitCodes.Error;
    }

    private static string? ResolveTriggerParamsJson(TriggerOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.ParamsFile))
        {
            return global::System.IO.File.ReadAllText(options.ParamsFile);
        }

        return string.IsNullOrWhiteSpace(options.Params) ? null : options.Params;
    }
}

/// <summary>Parsed after stripping the top-level <c>trigger</c> argv token.</summary>
public sealed class TriggerOptions
{
    [Value(0, MetaName = "command", Required = true, HelpText = "list | events | add | update | delete | enable | disable")]
    public string? Command { get; set; }

    [Option("id", HelpText = "Trigger task id (update/delete/enable/disable).")]
    public string? Id { get; set; }

    [Option("event", HelpText = "Event type id, case sensitive (see trigger events).")]
    public string? EventType { get; set; }

    [Option("action", HelpText = "Action id (Guid) or action title to run when triggered.")]
    public string? Action { get; set; }

    [Option("action-param", HelpText = "Parameter passed to the action.")]
    public string? ActionParam { get; set; }

    [Option("params", HelpText = "JSON object of event params (keys from trigger events).")]
    public string? Params { get; set; }

    [Option("params-file", HelpText = "Path to JSON file with event params.")]
    public string? ParamsFile { get; set; }

    [Option("note", HelpText = "Display note for the rule.")]
    public string? Note { get; set; }

    [Option("filter", HelpText = "Event filter expression evaluated against event variables.")]
    public string? Filter { get; set; }

    [Option("machines", HelpText = "Machine binding (empty = all machines).")]
    public string? Machines { get; set; }

    [Option("debounce", HelpText = "Debounce milliseconds.")]
    public int? DebounceMs { get; set; }

    [Option("throttle", HelpText = "Throttle milliseconds.")]
    public int? ThrottleMs { get; set; }

    [Option("delay", HelpText = "Delay before running the action, milliseconds.")]
    public int? DelayMs { get; set; }

    [Option("skip-further", HelpText = "Skip remaining trigger tasks for the same event.")]
    public bool SkipFurther { get; set; }

    [Option("disabled", HelpText = "add: create the rule disabled; update: disable it.")]
    public bool Disabled { get; set; }

    [Option("enabled", HelpText = "update: enable the rule.")]
    public bool Enabled { get; set; }

    [Option('q', "query", HelpText = "list: filter by note/event/action/id keyword.")]
    public string? Query { get; set; }

    [Option("timeout", Default = 30, HelpText = "RPC timeout seconds.")]
    public int TimeoutSeconds { get; set; }

    [Option("no-bootstrap", HelpText = "Skip quicker:runaction bootstrap.")]
    public bool NoBootstrap { get; set; }

    [Option("json", HelpText = "Emit JSON.")]
    public bool Json { get; set; }
}
