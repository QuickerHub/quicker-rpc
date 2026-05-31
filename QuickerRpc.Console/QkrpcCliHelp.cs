using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

/// <summary>Machine-readable CLI reference for scripts and AI agents.</summary>
internal static class QkrpcCliHelp
{
    private static readonly JsonSerializerOptions JsonWriteOptions = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static void WriteJson(TextWriter output)
    {
        output.WriteLine(JsonSerializer.Serialize(Build(), JsonWriteOptions));
    }

    private static object Build()
    {
        return new
        {
            name = "qkrpc",
            version = GetCliVersion(),
            pipe = QuickerRpcPipeNames.ServerPipe,
            pluginBootstrap = new
            {
                runActionUri = QuickerRpcBootstrap.BuildRunActionUri(),
                runActionId = QuickerRpcBootstrap.PluginRunActionId,
                autoStart = "When pipe is unavailable, qkrpc tries quicker:runaction once before failing (disable with --no-bootstrap).",
            },
            discovery = "qkrpc help --json",
            exitCodes = new Dictionary<string, string>
            {
                ["0"] = "success",
                ["1"] = "error",
            },
            prerequisites = new[]
            {
                "Quicker is running",
                "QuickerRpc plugin loaded, or auto-started via quicker:runaction",
            },
            commands = new object[]
            {
                new
                {
                    name = "help",
                    summary = "Emit this machine-readable CLI reference.",
                    usage = "qkrpc help --json",
                    options = new[]
                    {
                        Option("json", "Emit JSON for automation.", required: true),
                    },
                    examples = new[] { "qkrpc help --json" },
                    responseExample = new { ok = true, action = "help", name = "qkrpc" },
                },
                new
                {
                    name = "ping",
                    summary = "Check connectivity to the QuickerRpc plugin.",
                    usage = "qkrpc ping [--json] [--timeout <seconds>] [--no-bootstrap]",
                    options = new[]
                    {
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start via quicker:runaction when plugin pipe is missing."),
                    },
                    examples = new[] { "qkrpc ping --json" },
                    responseExample = new
                    {
                        ok = true,
                        action = "ping",
                        pong = "pong",
                        protocolVersion = 1,
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[] { "PLUGIN_NOT_RUNNING", "CONNECT_TIMEOUT", "RPC_TIMEOUT", "PING_FAILED" },
                },
                new
                {
                    name = "action update",
                    summary = "Upload or refresh a shared action in Quicker.",
                    usage = "qkrpc action update --id <guid> [--changelog <text> | --changelog-file <path>] [--json] [--timeout <seconds>]",
                    options = new[]
                    {
                        Option("id", "Shared action id (GUID)."),
                        Option("code", "Alias for --id."),
                        Option("changelog", "Inline change log message. Mutually exclusive with --changelog-file."),
                        Option("changelog-file", "Read change log from a UTF-8 text file.", shortName: "f"),
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                    },
                    examples = new[]
                    {
                        "qkrpc action update --id {sharedActionGuid} --changelog \"fix\" --json",
                        "qkrpc action update --id {sharedActionGuid} --changelog-file changelog.txt --json",
                        "qkrpc action update --code {sharedActionGuid} -f changelog.txt --json",
                    },
                    responseExample = new
                    {
                        ok = true,
                        action = "update",
                        sharedId = "{sharedActionGuid}",
                        message = "更新分享成功。",
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[]
                    {
                        "UNKNOWN_ACTION_VERB",
                        "MISSING_ACTION_ID",
                        "CONFLICTING_CHANGELOG",
                        "CHANGELOG_FILE_NOT_FOUND",
                        "CHANGELOG_FILE_READ_FAILED",
                        "UPDATE_FAILED",
                    },
                },
                new
                {
                    name = "action search",
                    summary = "Search local Quicker actions by keyword and return action ids.",
                    usage = "qkrpc action search --query <keyword> [--limit 20] [--json] [--timeout <seconds>]",
                    options = new[]
                    {
                        Option("query", "Search keyword (title, description, pinyin).", shortName: "q"),
                        Option("limit", "Max results (1-100).", defaultValue: "20"),
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                    },
                    examples = new[]
                    {
                        "qkrpc action search --query \"clipboard\" --json",
                        "qkrpc action search -q \"更新\" --limit 10 --json",
                    },
                    responseExample = new
                    {
                        ok = true,
                        action = "search",
                        query = "clipboard",
                        count = 1,
                        items = new[]
                        {
                            new
                            {
                                id = "{actionGuid}",
                                title = "Copy to clipboard",
                                description = (string?)null,
                                pageTitle = "My Panel",
                                score = 100,
                                sharedActionId = (string?)null,
                            },
                        },
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[]
                    {
                        "UNKNOWN_ACTION_VERB",
                        "MISSING_QUERY",
                        "SEARCH_FAILED",
                    },
                },
                new
                {
                    name = "action delete",
                    summary = "Delete a local Quicker action.",
                    usage = "qkrpc action delete --id <actionId> --yes [--json] [--timeout <seconds>]",
                    options = new[]
                    {
                        Option("id", "Local action id (GUID)."),
                        Option("code", "Alias for --id."),
                        Option("yes", "Required; skips Quicker confirm dialog.", shortName: "y", required: true),
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                    },
                    examples = new[]
                    {
                        "qkrpc action delete --id {actionGuid} --yes --json",
                    },
                    responseExample = new
                    {
                        ok = true,
                        action = "delete",
                        actionId = "{actionGuid}",
                        message = "动作已删除。",
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[]
                    {
                        "UNKNOWN_ACTION_VERB",
                        "CONFIRMATION_REQUIRED",
                        "MISSING_ACTION_ID",
                        "DELETE_FAILED",
                    },
                },
                new
                {
                    name = "action edit",
                    summary = "Open the Quicker action editor for a local action.",
                    usage = "qkrpc action edit --id <actionId> [--json] [--timeout <seconds>]",
                    options = new[]
                    {
                        Option("id", "Local action id (GUID)."),
                        Option("code", "Alias for --id."),
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                    },
                    examples = new[]
                    {
                        "qkrpc action edit --id {actionGuid} --json",
                        "qkrpc action search --query \"clipboard\" --json  # then edit items[].id",
                    },
                    responseExample = new
                    {
                        ok = true,
                        action = "edit",
                        actionId = "{actionGuid}",
                        message = "动作编辑窗口已打开。",
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[]
                    {
                        "UNKNOWN_ACTION_VERB",
                        "MISSING_ACTION_ID",
                        "EDIT_FAILED",
                    },
                },
                new
                {
                    name = "action edit-var",
                    summary = "Edit a global subprogram variable default value and save (e.g. version).",
                    usage = "qkrpc action edit-var --id <subProgramIdOrName> --var <key> --value <defaultValue> [--json] [--timeout <seconds>]",
                    options = new[]
                    {
                        Option("id", "Global subprogram id or name."),
                        Option("code", "Alias for --id."),
                        Option("var", "Variable key (e.g. version)."),
                        Option("value", "New default value."),
                        Option("json", "Emit JSON for automation."),
                        Option("timeout", "Pipe connect and RPC timeout in seconds.", defaultValue: "10"),
                    },
                    examples = new[]
                    {
                        "qkrpc action edit-var --id MySubProgram --var version --value 2.1 --json",
                        "qkrpc action edit-var --code {subProgramGuid} --var version --value 3 --json",
                    },
                    responseExample = new
                    {
                        ok = true,
                        action = "edit-var",
                        subProgramIdOrName = "MySubProgram",
                        variableKey = "version",
                        oldValue = "2.0",
                        newValue = "2.1",
                        message = "变量 version 变更 2.0 => 2.1",
                        pipe = QuickerRpcPipeNames.ServerPipe,
                    },
                    errors = new[]
                    {
                        "UNKNOWN_ACTION_VERB",
                        "MISSING_SUBPROGRAM_ID",
                        "MISSING_VARIABLE",
                        "MISSING_VALUE",
                        "EDIT_VAR_FAILED",
                    },
                },
            },
            errorResponseExample = new
            {
                ok = false,
                error = "PLUGIN_NOT_RUNNING",
                message = "QuickerRpc 插件未运行（命名管道不可用）。",
                hints = QuickerRpcConnect.BuildPluginNotRunningHints(bootstrapAttempted: true),
                pipe = QuickerRpcPipeNames.ServerPipe,
            },
        };
    }

    private static object Option(string name, string description, string? shortName = null, string? defaultValue = null, bool required = false)
    {
        return new
        {
            name,
            shortName,
            description,
            defaultValue,
            required = required ? true : (bool?)null,
        };
    }

    private static string GetCliVersion()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            return informational;
        }

        return assembly.GetName().Version?.ToString() ?? "unknown";
    }
}
