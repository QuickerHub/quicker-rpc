using System.Collections.Generic;

using System.Reflection;

using System.Text.Json;

using System.Text.Json.Serialization;

using QuickerRpc.Contracts.Rpc;



namespace QuickerRpc.Console;



/// <summary>Machine-readable CLI reference for scripts and AI agents.</summary>

internal static class QkrpcCliHelp

{

    public static void WriteJson(TextWriter output)

    {

        output.WriteLine(JsonSerializer.Serialize(Build(), QkrpcJson.HelpOutput));

    }



    private static object Build()

    {

        return new

        {

            name = "qkrpc",

            version = GetCliVersion(),

            pipe = QuickerRpcPipeNames.ServerPipe,

            discovery = "qkrpc help --json",

            agentWorkflow =
                "guide authoring-workflow + subprogram-workflow: action/subprogram create → get → " +
                "step-runner get (required) → patch; call subprograms via sys:subprogram + callIdentifier",
            authoringGuideTopic = "authoring-workflow",
            subprogramGuideTopic = "subprogram-workflow",

            jsonFlag = "Append --json for structured stdout on all commands.",

            exitCodes = new Dictionary<string, string>

            {

                ["0"] = "success",

                ["1"] = "error",

            },

            commands = new object[]

            {

                Cmd("help", "Emit machine-readable CLI reference.", "qkrpc help --json",

                    opts: new[] { Option("json", "Required for JSON output.", required: true) }),

                Cmd("serve", "HTTP API with persistent pipe (agent-gui).", "qkrpc serve [--host 127.0.0.1] [--port 9477] [--timeout 120] [--no-bootstrap]",

                    opts: new[] { Option("host", "Bind address.", defaultValue: "127.0.0.1"), Option("port", "HTTP port.", defaultValue: "9477"), Option("timeout", "Per-request RPC timeout (seconds).", defaultValue: "120"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("ping", "Check QuickerRpc plugin connectivity.", "qkrpc ping [--json] [--timeout 10] [--no-bootstrap]",

                    opts: JsonTimeoutBootstrap()),

                Cmd("guide get", "Read ActionAuthoring guides (start: authoring-workflow).", "qkrpc guide get --topic <id> [--json]",

                    opts: new[] { Option("topic", "Topic id (authoring-workflow, overview, patch-workflow, step-runner-search, …)."), Option("json", "Structured output.") }),

                Cmd("guide search", "Search authoring guides.", "qkrpc guide search [--query <keyword>] [--limit 10] [--json]",

                    opts: new[] { Option("query", "Keyword.", shortName: "q"), Option("limit", "Max results.", defaultValue: "10"), Option("json", "Structured output.") }),

                Cmd("action create", "Create XAction on auto-managed virtual action page (creates virtual process/page as needed).", "qkrpc action create [--title <text>] [--description <text>] [--icon <spec>] [--profile-id <guid>] [--json]",

                    opts: new[]
                    {
                        Option("title", "Action title (default: 新动作)."),
                        Option("description", "Action description."),
                        Option("icon", "Icon: fa:Light_Name[:#color] or absolute http(s) image URL."),
                        Option("profile-id", "Use a specific @qkrpc virtual page id."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("action get", "Read compressed XAction by action id.", "qkrpc action get --id <guid> [--return-mode full|structure|metadata] [--json]",

                    opts: ActionHeadlessOpts()),

                Cmd("action patch", "Apply partial XAction patch (one call = one save). Patch JSON may also include title, description, icon. On success use response; do not action_get only to verify.", "qkrpc action patch --id <guid> --patch-file <path|-> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionPatchOpts()),

                Cmd("action set-metadata", "Update action title, description, and/or icon (does not change steps/variables).", "qkrpc action set-metadata --id <guid> [--title <text>] [--description <text>] [--icon <spec|url>] [--expected-edit-version N] [--force] [--json]",

                    opts: ActionSetMetadataOpts()),

                Cmd("action replace", "Replace steps/variables.", "qkrpc action replace --id <guid> --xaction-file <path|-> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionReplaceOpts()),

                Cmd("action extract", "Extract action to .quicker/actions/{name} (auto file refs for values >10 lines). Dir from title or --dir; id in info.json.", "qkrpc action extract --id <guid> [--dir <path>] [--min-lines 10] [--no-auto-files] [--json]",

                    opts: ActionExtractOpts()),

                Cmd("action apply", "Apply .quicker project to action (compile file refs, replace). Resolves action id from info.json.", "qkrpc action apply [--dir <path>] [--id <guid>] [--expected-edit-version N] [--force] [--json]",

                    opts: ActionApplyOpts()),

                Cmd("action validate", "Validate local action project (compile file refs dry-run, list file refs).", "qkrpc action validate [--id <guid>] [--dir <path>] [--json]",

                    opts: ActionValidateOpts()),

                Cmd("action export", "Export action to .quicker project dir (info.json + data.json; preserves file refs; no auto file refs).", "qkrpc action export --id <guid> --dir <path> [--json]",

                    opts: ActionProjectOpts()),

                Cmd("action import", "Import .quicker project (compile file refs to value, then replace).", "qkrpc action import --dir <path> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionProjectImportOpts()),

                Cmd("action list", "List/search actions (agent summaries).", "qkrpc action list [--query <keyword>] [--scope chrome|global|common|...] [--limit 30] [--sort relevance|lastEdit|title] [--json]",

                    opts: new[] { Option("query", "Optional filter.", shortName: "q"), Option("scope", "Process/scene filter (chrome, global, common, default, agent, profile id)."), Option("limit", "Max results.", defaultValue: "30"), Option("sort", "relevance (default with --query) | lastEdit (default without --query) | title."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("action update", "Upload or refresh a shared action.", "qkrpc action update --id <guid> [--changelog <text>] [--json]",

                    opts: new[] { Option("id", "Shared action GUID."), Option("changelog", "Change log text."), Option("json", "Structured output.") }),

                Cmd("action move", "Move a local action to another profile; defaults to the first empty slot.", "qkrpc action move --id <guid> --profile <profileIdOrName> [--row N --col N] [--swap] [--json]",

                    opts: new[]
                    {
                        Option("id", "Action GUID."),
                        Option("profile", "Target profile id/name/scope."),
                        Option("profile-id", "Alias for --profile."),
                        Option("row", "Target row. Must be used with --col."),
                        Option("col", "Target column. Must be used with --row."),
                        Option("swap", "Exchange with the action at target row/col if occupied."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("action search", "Search local actions (main search box scoring).", "qkrpc action search --query <keyword> [--scope chrome|global|common|...] [--limit 20] [--json]",

                    opts: new[] { Option("query", "Keyword.", shortName: "q"), Option("scope", "Process/scene filter (chrome, global, common, default, agent, profile id)."), Option("limit", "Max results.", defaultValue: "20"), Option("json", "Structured output.") }),

                Cmd("subprogram search", "Search global subprograms (returns callIdentifier for sys:subprogram).", "qkrpc subprogram search --query <keyword> [--limit 20] [--json]",

                    opts: new[] { Option("query", "Keyword.", shortName: "q"), Option("limit", "Max results.", defaultValue: "20"), Option("json", "Structured output.") }),

                Cmd("subprogram list", "List global subprograms.", "qkrpc subprogram list [--query <keyword>] [--limit 30] [--json]",

                    opts: new[] { Option("query", "Optional filter.", shortName: "q"), Option("limit", "Max results.", defaultValue: "30"), Option("json", "Structured output.") }),

                Cmd("subprogram create", "Create a global subprogram.", "qkrpc subprogram create --name <name> [--description <text>] [--json]",

                    opts: new[] { Option("name", "Unique subprogram name."), Option("description", "Description."), Option("icon", "Icon spec."), Option("json", "Structured output.") }),

                Cmd("subprogram get", "Read compressed subprogram program.", "qkrpc subprogram get --id <idOrName> [--return-mode full|structure|metadata] [--json]",

                    opts: SubProgramHeadlessOpts()),

                Cmd("subprogram patch", "Apply partial patch to subprogram (same JSON shape as action patch).", "qkrpc subprogram patch --id <idOrName> --patch-file <path|-> [--expected-edit-version N] [--json]",

                    opts: SubProgramPatchOpts()),

                Cmd("subprogram replace", "Replace subprogram steps/variables.", "qkrpc subprogram replace --id <idOrName> --program-file <path|-> [--expected-edit-version N] [--json]",

                    opts: SubProgramReplaceOpts()),

                Cmd("subprogram export", "Export subprogram to .quicker project dir.", "qkrpc subprogram export --id <idOrName> --dir <path> [--json]",

                    opts: SubProgramProjectOpts()),

                Cmd("subprogram import", "Import .quicker subprogram project.", "qkrpc subprogram import --dir <path> [--expected-edit-version N] [--force] [--json]",

                    opts: SubProgramProjectImportOpts()),

                Cmd("subprogram edit", "Open subprogram editor UI.", "qkrpc subprogram edit --id <idOrName> [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("json", "Structured output.") }),

                Cmd("subprogram edit-var", "Edit subprogram variable default via designer UI.", "qkrpc subprogram edit-var --id <idOrName> --var <key> --value <val> [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("var", "Variable key."), Option("value", "New default."), Option("json", "Structured output.") }),

                Cmd("subprogram delete", "Delete a global subprogram.", "qkrpc subprogram delete --id <idOrName> --yes [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("yes", "Required.", shortName: "y", required: true), Option("json", "Structured output.") }),

                Cmd("action delete", "Delete a local action.", "qkrpc action delete --id <guid> --yes [--json]",

                    opts: new[] { Option("id", "Action GUID."), Option("yes", "Required.", shortName: "y", required: true), Option("json", "Structured output.") }),

                Cmd("action run", "Run a local action.", "qkrpc action run --id <idOrName> [--param <text>] [--debug] [--wait] [--json]",

                    opts: new[] { Option("id", "Action id or name."), Option("param", "Input param.", shortName: "p"), Option("debug", "Debug run (opens Quicker step debugger)."), Option("wait", "Wait for result."), Option("json", "Structured output.") }),

                Cmd("action float", "Show a local action as a floating button.", "qkrpc action float --id <idOrName> [--json]",

                    opts: new[] { Option("id", "Action id or name."), Option("json", "Structured output.") }),

                Cmd("action edit", "Open action editor UI.", "qkrpc action edit --id <guid> [--json]",

                    opts: new[] { Option("id", "Action GUID."), Option("json", "Structured output.") }),

                Cmd("action edit-var", "Edit variable default via designer UI.", "qkrpc action edit-var --id <id> --var <key> --value <val> [--json]",

                    opts: new[] { Option("id", "Subprogram or action id."), Option("var", "Variable key."), Option("value", "New default."), Option("json", "Structured output.") }),

                Cmd("step-runner search", "Search StepRunner catalog (| OR, * wildcard). Use when step-modules has no match.", "qkrpc step-runner search --query <keyword> [--limit 40] [--json]",

                    opts: new[] { Option("query", "Filter: AND with spaces, OR with |, * wildcard.", shortName: "q"), Option("limit", "Max results.", defaultValue: "40"), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("step-runner get", "StepRunner schema: input param keys/types (required before patch inputParams). Use --control-field when ControlField exists.", "qkrpc step-runner get --key <stepRunnerKey> [--control-field <value>] [--json]",

                    opts: new[] { Option("key", "StepRunner key."), Option("control-field", "Control-field value (from search or ControlField.Selection)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("fa resolve", "Resolve fa: specs to SVG path data (for UIs).", "qkrpc fa resolve --spec fa:Light_Flask [--json] | qkrpc fa resolve --specs '[\"fa:Light_A\"]' --json",
                    opts: new[] { Option("spec", "Single fa: icon spec."), Option("specs", "JSON array of fa: specs (batch, max 80 unique)."), Option("json", "Structured output: items[] with path, width, height."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),
                Cmd("fa search", "Search FA icons (see guide action-icons). Default: Light_* + Brands_*; --expand: all styles.", "qkrpc fa search [--query <keyword>] [--limit 40] [--expand] [--json]",

                    opts: new[] { Option("query", "Filter: AND with spaces, OR with |, * wildcard.", shortName: "q"), Option("limit", "Max results (unique glyphs default, or rows with --expand).", defaultValue: "40"), Option("expand", "No compress: all style rows (Solid/Regular/Light/…)."), Option("all-styles", "Alias for --expand."), Option("json", "Structured output: names[] (Light_*|Brands_*). Spec: fa:{name} or fa:{name}:{#color} (action-icons)."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),

            },

        };

    }



    private static object[] ActionHeadlessOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("return-mode", "full | structure | metadata."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionPatchOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("patch", "Inline patch JSON."),

            Option("patch-file", "Patch JSON file or - for stdin."),

            Option("expected-edit-version", "From action get."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionSetMetadataOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("title", "New title (omit to leave unchanged)."),

            Option("description", "New description (pass empty string to clear)."),

            Option("icon", "Icon: fa:Light_Name[:#color] or absolute http(s) image URL."),

            Option("expected-edit-version", "From action get."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionReplaceOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("xaction", "Inline XAction JSON."),

            Option("xaction-file", "XAction JSON file or - for stdin."),

            Option("expected-edit-version", "From action get."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionProjectOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("dir", "Project directory (e.g. .quicker/actions/<name>). Action id from info.json."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionExtractOpts() =>

        new object[]

        {

            Option("id", "Action GUID."),

            Option("dir", "Override project directory (e.g. .quicker/actions/<name>). Default: title slug or existing project."),

            Option("min-lines", "Externalize inline values with more than N lines.", defaultValue: "10"),

            Option("no-auto-files", "Keep all inputParams inline."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionApplyOpts() =>

        new object[]

        {

            Option("id", "Action GUID (optional if info.json present; default dir uses this)."),

            Option("dir", "Project directory (e.g. .quicker/actions/<name>). Action id from info.json."),

            Option("expected-edit-version", "From info.json or prior extract."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] ActionValidateOpts() =>

        new object[]

        {

            Option("id", "Action GUID (optional if info.json present; default dir uses this)."),

            Option("dir", "Project directory (e.g. .quicker/actions/<name>). Action id from info.json."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

        };



    private static object[] ActionProjectImportOpts() =>

        new object[]

        {

            Option("dir", "Project directory."),

            Option("expected-edit-version", "From info.json or prior export."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] SubProgramHeadlessOpts() =>

        new object[]

        {

            Option("id", "Subprogram id or name."),

            Option("return-mode", "full | structure | metadata."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] SubProgramPatchOpts() =>

        new object[]

        {

            Option("id", "Subprogram id or name."),

            Option("patch", "Inline patch JSON."),

            Option("patch-file", "Patch JSON file or - for stdin."),

            Option("expected-edit-version", "From subprogram get."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] SubProgramReplaceOpts() =>

        new object[]

        {

            Option("id", "Subprogram id or name."),

            Option("program", "Inline program JSON { steps, variables }."),

            Option("program-file", "Program JSON file or - for stdin."),

            Option("expected-edit-version", "From subprogram get."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] SubProgramProjectOpts() =>

        new object[]

        {

            Option("id", "Subprogram id or name."),

            Option("dir", "Project directory (e.g. .quicker/subprograms/my-sub)."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object[] SubProgramProjectImportOpts() =>

        new object[]

        {

            Option("dir", "Project directory."),

            Option("expected-edit-version", "From info.json or prior export."),

            Option("force", "Skip version check."),

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip auto-start."),

        };



    private static object Cmd(string name, string summary, string usage, object[] opts)

    {

        return new { name, summary, usage, options = opts };

    }



    private static object[] JsonTimeoutBootstrap() =>

        new object[]

        {

            Option("json", "Structured output."),

            Option("timeout", "Seconds.", defaultValue: "10"),

            Option("no-bootstrap", "Skip quicker:runaction auto-start."),

        };



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

