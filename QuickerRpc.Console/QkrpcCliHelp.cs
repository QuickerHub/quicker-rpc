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

                Cmd("serve openapi", "Export OpenAPI 3.1 for qkrpc serve HTTP API.", "qkrpc serve openapi [--json] [--out <file>] [--host 127.0.0.1] [--port 9477]",

                    opts: new[] { Option("json", "Write JSON to stdout."), Option("out", "Write JSON to file."), Option("host", "Base URL host.", defaultValue: "127.0.0.1"), Option("port", "Base URL port.", defaultValue: "9477") }),

                Cmd("mcp", "MCP server over stdio (Cursor, VS Code, Claude, Windsurf, Cline).", "qkrpc mcp [--timeout 120] [--no-bootstrap]",

                    opts: new[] { Option("timeout", "Per-tool RPC timeout (seconds).", defaultValue: "120"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("agent setup", "Install MCP + skills + rules for AI agents (user-level default).", "qkrpc agent setup [--cursor] [--claude] [--vscode] [--windsurf] [--cline] [--all] [--project] [--project-skills] [--workspace <path>] [--skill-source <dir>] [--skip-skill] [--check]",

                    opts: AgentSetupOptions()),

                Cmd("mcp install", "Alias for qkrpc agent setup.", "qkrpc mcp install [same flags as agent setup]",

                    opts: AgentSetupOptions()),

                Cmd("ping", "Check QuickerRpc plugin connectivity.", "qkrpc ping [--json] [--timeout 10] [--no-bootstrap]",

                    opts: JsonTimeoutBootstrap()),

                Cmd("wait", "Poll until QuickerRpc plugin is reachable.", "qkrpc wait [--json] [--timeout 120] [--interval 2] [--no-bootstrap]",

                    opts: new[]
                    {
                        Option("timeout", "Max wait seconds.", defaultValue: "120"),
                        Option("interval", "Poll interval seconds.", defaultValue: "2"),
                        Option("json", "Structured output."),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("guide get", "Read ActionAuthoring guides (start: authoring-workflow). action-data-schema topic returns JSON schema for data.json.", "qkrpc guide get --topic <id> [--json]",

                    opts: new[] { Option("topic", "Topic id (authoring-workflow, overview, patch-workflow, step-runner-search, …)."), Option("json", "Structured output.") }),

                Cmd("guide search", "Search authoring guides.", "qkrpc guide search [--query <keyword>] [--limit 10] [--json]",

                    opts: new[] { Option("query", "Keyword.", shortName: "q"), Option("limit", "Max results.", defaultValue: "10"), Option("json", "Structured output.") }),

                Cmd("action create", "Create XAction on auto-managed virtual action page.", "qkrpc action create [--title <text>] [--description <text>] [--icon <spec>] [--profile-id <guid>] [--json]",

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

                Cmd("action patch", "Apply partial XAction patch (one call = one save). Patch JSON may also include title, description, icon, contextMenuData. On success use response; do not action_get only to verify.", "qkrpc action patch --id <guid> --patch-file <path|-> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionPatchOpts()),

                Cmd("action set-metadata", "Update action title, description, icon, and/or context menu (does not change steps/variables).", "qkrpc action set-metadata --id <guid> [--title <text>] [--description <text>] [--icon <spec|url>] [--context-menu-data <text>] [--expected-edit-version N] [--force] [--json]",

                    opts: ActionSetMetadataOpts()),

                Cmd("action replace", "Replace steps/variables.", "qkrpc action replace --id <guid> --xaction-file <path|-> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionReplaceOpts()),

                Cmd("action extract", "Extract action to .quicker/actions/{name} (auto file refs for values >4 lines). Dir from title or --dir; id in info.json.", "qkrpc action extract --id <guid> [--dir <path>] [--min-lines 4] [--no-auto-files] [--json]",

                    opts: ActionExtractOpts()),

                Cmd("action apply", "Apply .quicker project to action (compile file refs, replace). Resolves action id from info.json.", "qkrpc action apply [--dir <path>] [--id <guid>] [--expected-edit-version N] [--force] [--json]",

                    opts: ActionApplyOpts()),

                Cmd("action validate", "Validate local action project (compile file refs dry-run, list file refs).", "qkrpc action validate [--id <guid>] [--dir <path>] [--json]",

                    opts: ActionValidateOpts()),

                Cmd("action export", "Export action to .quicker project dir (info.json + data.json; preserves file refs; no auto file refs).", "qkrpc action export --id <guid> --dir <path> [--json]",

                    opts: ActionProjectOpts()),

                Cmd("action import", "Import .quicker project (compile file refs to value, then replace).", "qkrpc action import --dir <path> [--expected-edit-version N] [--force] [--json]",

                    opts: ActionProjectImportOpts()),

                Cmd("action list", "List/search actions. --query accepts plain text, legacy prefixes, or JSON {filter,sort,keyword,fields}.", "qkrpc action list [--query <text|json>] [--query-file <path>] [--fields actionId,title,...] [--filter library|local|published] [--scope ...] [--limit 30] [--sort relevance|lastEdit|title] [--json]",

                    opts: new[] { Option("query", "Plain keyword; legacy prefixes; or JSON. filter: {source,uses,usesOnly,keyword,script|expr}; sort: {key,script,by,desc}; fields: [actionId,title,...] or *.", shortName: "q"), Option("query-file", "UTF-8 file for --query JSON/text."), Option("fields", "Output projection: comma-separated field names or * (also fields/select/columns in JSON query)."), Option("filter", "Shorthand for plain query: library|installed|local|published."), Option("scope", "Process/scene filter (chrome, global, common, default, agent, profile id)."), Option("limit", "Max results.", defaultValue: "30"), Option("sort", "relevance (default with --query) | lastEdit (default without --query) | title. Ignored when JSON sort script is set."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("action publish", "Share or refresh an action on getquicker.net (auto-detects first publish vs update). Public first publish writes the action page intro (--html/--html-file) and auto-submits for library review.", "qkrpc action publish --id <guid> [--preflight] [--title <text>] [--description <text>] [--html-file <path>] [--changelog <text>] [--note-file <path>] [--json]",

                    opts: new[]
                    {
                        Option("id", "Local action GUID or shared action GUID (update)."),
                        Option("preflight", "Validate required fields without uploading."),
                        Option("title", "Share title (first publish; defaults to action title)."),
                        Option("description", "Short description (first publish; defaults to action description)."),
                        Option("share-note", "Action page intro plain text/markdown (converted to Detail HTML for review submit)."),
                        Option("note-file", "Action page intro UTF-8 file (same as --share-note)."),
                        Option("html", "Action page intro HTML (Detail; overrides --share-note). Required for public publish unless --share-note or --no-submit-review."),
                        Option("html-file", "Action page intro HTML UTF-8 file."),
                        Option("tags", "Comma-separated predefined getquicker categories (e.g. 文本处理,AI); free-form tags are rejected."),
                        Option("keywords", "Search keywords."),
                        Option("changelog", "Required when updating an already-shared action."),
                        Option("changelog-file", "Changelog UTF-8 file (update)."),
                        Option("private", "Non-public share (first publish)."),
                        Option("no-submit-review", "Skip auto submit-for-review (public publish)."),
                        Option("json", "Structured output."),
                    }),

                Cmd("action shared-info-get", "Read getquicker shared action Detail HTML via Plugin HTTP (temp-token login; no Playwright).", "qkrpc action shared-info-get --id <sharedId|localId> [--json]",

                    opts: new[] { Option("id", "Shared or local action GUID."), Option("code", "Alias for --id."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("action shared-info-set", "Update getquicker shared action Detail HTML via Plugin HTTP multipart form (Quicker login).", "qkrpc action shared-info-set --id <sharedId|localId> [--html-file <path>] [--json]",

                    opts: new[] { Option("id", "Shared or local action GUID."), Option("code", "Alias for --id."), Option("html", "Detail HTML body."), Option("html-file", "UTF-8 Detail HTML file."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "60"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("action shared-info-submit-review", "Write action page intro (optional) and submit shared action for library review (保存并发布到动作库).", "qkrpc action shared-info-submit-review --id <sharedId|localId> [--share-note <text>|--html-file <path>] [--json]",

                    opts: new[] { Option("id", "Shared or local action GUID."), Option("code", "Alias for --id."), Option("share-note", "Plain-text intro (converted to Detail HTML)."), Option("note-file", "UTF-8 intro file."), Option("html", "Detail HTML body (overrides --share-note)."), Option("html-file", "UTF-8 Detail HTML file."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "90"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("action update", "Alias for action publish (refresh shared action; pass --changelog).", "qkrpc action update --id <guid> [--changelog <text>] [--json]",

                    opts: new[] { Option("id", "Local or shared action GUID."), Option("changelog", "Change log text."), Option("changelog-file", "Changelog UTF-8 file."), Option("json", "Structured output.") }),

                Cmd("action move", "Move a local action to another profile; defaults to the first empty slot. When the page is full, default asks via needsUserChoice JSON.", "qkrpc action move --id <guid> --profile <profileIdOrName> [--row N --col N] [--swap] [--on-no-empty-slot ask|cancel|create-page-after] [--on-occupied-slot ask|cancel|swap] [--json]",

                    opts: new[]
                    {
                        Option("id", "Action GUID."),
                        Option("profile", "Target profile id/name/scope."),
                        Option("profile-id", "Alias for --profile."),
                        Option("row", "Target row. Must be used with --col."),
                        Option("col", "Target column. Must be used with --row."),
                        Option("swap", "Exchange with the action at target row/col if occupied."),
                        Option("on-no-empty-slot", "No empty slot: ask (default) | cancel | create-page-after."),
                        Option("on-occupied-slot", "Occupied cell: ask (default) | cancel | swap."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("action search", "Alias for action list (same --query/--fields semantics; empty query = recent by lastEdit).", "qkrpc action search [--query <text|json>] [--query-file <path>] [--fields actionId,title,...] [--filter library|local|published] [--scope ...] [--limit 30] [--sort relevance|lastEdit|title] [--json]",

                    opts: new[] { Option("query", "Plain keyword; legacy prefixes; or JSON. filter: {source,uses,usesOnly,keyword,script|expr}; sort: {key,script,by,desc}; fields: [actionId,title,...] or *.", shortName: "q"), Option("query-file", "UTF-8 file for --query JSON/text."), Option("fields", "Output projection: comma-separated field names or *."), Option("filter", "Shorthand for plain query: library|installed|local|published."), Option("scope", "Process/scene filter (chrome, global, common, default, agent, profile id)."), Option("limit", "Max results.", defaultValue: "30"), Option("sort", "relevance (default with --query) | lastEdit (default without --query) | title."), Option("json", "Structured output.") }),

                Cmd("subprogram list", "List/search global subprograms (returns callIdentifier for sys:subprogram). Empty --query lists by name; non-empty filters.", "qkrpc subprogram list [--query <keyword>] [--limit 30] [--json]",

                    opts: new[] { Option("query", "Optional keyword filter.", shortName: "q"), Option("limit", "Max results.", defaultValue: "30"), Option("json", "Structured output.") }),

                Cmd("subprogram search", "Alias for subprogram list.", "qkrpc subprogram search [--query <keyword>] [--limit 30] [--json]",

                    opts: new[] { Option("query", "Optional keyword filter.", shortName: "q"), Option("limit", "Max results.", defaultValue: "30"), Option("json", "Structured output.") }),

                Cmd("profile delete", "Delete empty action profile pages (tabs). Fails when the page still has actions or is protected.", "qkrpc profile delete --id <profileIdOrName> [--ids <guid1,guid2>] [--json]",

                    opts: new[]
                    {
                        Option("id", "Profile GUID or exact profile name."),
                        Option("ids", "Comma-separated profile GUIDs or names."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("profile prune", "Delete all empty deletable action pages under a process scope (cleans up spill tabs after batch moves).", "qkrpc profile prune --scope chrome.exe [--json]",

                    opts: new[]
                    {
                        Option("scope", "Process scope (chrome.exe, chrome, global, _my_app, …)."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("profile create", "Create blank global action profile pages.", "qkrpc profile create --scope global [--count N] [--after-first] [--json]",

                    opts: new[]
                    {
                        Option("scope", "Profile scope (global)."),
                        Option("count", "Number of blank pages (1-20).", defaultValue: "1"),
                        Option("after-first", "Insert after the first global page (_global)."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("profile reorder", "Move existing global profile tabs after the first page.", "qkrpc profile reorder --scope global --after-first --id <profileGuid> [--id <profileGuid>...] [--json]",

                    opts: new[]
                    {
                        Option("scope", "Profile scope (global)."),
                        Option("after-first", "Insert after the first global page (_global)."),
                        Option("id", "Profile id to move (repeatable)."),
                        Option("ids", "Comma-separated profile ids."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "10"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("process ensure", "Create/ensure a virtual process tab with an initial action page. Find callers: action search --query uses:<SubName>.", "qkrpc process ensure --exe <key> --name <displayName> --profile-prefix <prefix> [--collect-subprogram <idOrName>] [--move-actions] [--move-any] [--json]",

                    opts: new[]
                    {
                        Option("exe", "Virtual process key (ExeFile), e.g. _my_app."),
                        Option("name", "Display name in scene/action management."),
                        Option("profile-prefix", "Action page name prefix (e.g. \"@MyApp \")."),
                        Option("collect-subprogram", "Subprogram id/name for --move-actions."),
                        Option("move-actions", "Move matching actions into the new page (requires --collect-subprogram)."),
                        Option("move-any", "Move any caller (default: dedicated subprogram wrappers only)."),
                        Option("json", "Structured output."),
                        Option("timeout", "Seconds.", defaultValue: "30"),
                        Option("no-bootstrap", "Skip auto-start."),
                    }),

                Cmd("subprogram create", "Create a global subprogram. --json includes dataSchema (subprogram variables IO).", "qkrpc subprogram create --name <name> [--description <text>] [--json]",

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

                Cmd("subprogram apply", "Alias for subprogram import (workspace save to Quicker).", "qkrpc subprogram apply --dir <path> [--expected-edit-version N] [--force] [--json]",

                    opts: SubProgramProjectImportOpts()),

                Cmd("subprogram validate", "Validate .quicker subprogram project (file refs, data.json).", "qkrpc subprogram validate --dir <path> [--json]",

                    opts: new[] { Option("dir", "Project directory."), Option("json", "Structured output.") }),

                Cmd("subprogram edit", "Open subprogram editor UI.", "qkrpc subprogram edit --id <idOrName> [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("json", "Structured output.") }),

                Cmd("subprogram edit-var", "Edit subprogram variable default headlessly.", "qkrpc subprogram edit-var --id <idOrName> --var <key> --value <val> [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("var", "Variable key."), Option("value", "New default."), Option("json", "Structured output.") }),

                Cmd("subprogram delete", "Delete a global subprogram.", "qkrpc subprogram delete --id <idOrName> --yes [--json]",

                    opts: new[] { Option("id", "Subprogram id or name."), Option("yes", "Required.", shortName: "y", required: true), Option("json", "Structured output.") }),

                Cmd("action delete", "Delete a local action.", "qkrpc action delete --id <guid> --yes [--json]",

                    opts: new[] { Option("id", "Action GUID."), Option("yes", "Required.", shortName: "y", required: true), Option("json", "Structured output.") }),

                Cmd("action run", "Run action via Quicker RPC or standalone ActionRuntime.", "qkrpc action run --id <idOrName> [--param <text>] [--debug|--trace] [--wait] [--json] | qkrpc action run --standalone --dir <project> [--param <text>] [--json] | qkrpc action run --standalone --package-file <path> [--json] | qkrpc action run --xaction-file <path|-> --trace [--param <text>] [--json]",

                    opts: new[] { Option("id", "Action id or name."), Option("param", "Input param.", shortName: "p"), Option("standalone", "Run via Quicker.ActionRuntime (no Quicker)."), Option("package-file", "ActionExecutionPackage JSON (standalone)."), Option("dir", "Local .quicker project dir (standalone)."), Option("verbose-host", "Standalone: log host callbacks."), Option("debug", "Debug run (Quicker UI or runtime flag)."), Option("trace", "Trace run (plugin terminal debug log, XAction only)."), Option("wait", "Wait for result."), Option("json", "Structured output.") }),

                Cmd("action runtime-check", "Check whether a program is fully supported by ActionRuntime.", "qkrpc action runtime-check --dir <project> [--json] | qkrpc action runtime-check --package-file <path> [--json] | qkrpc action runtime-check --id <guid> [--json]",

                    opts: new[] { Option("id", "Action id (resolve .quicker project)."), Option("dir", "Local .quicker project dir."), Option("package-file", "ActionExecutionPackage JSON."), Option("xaction-file", "Program JSON file."), Option("json", "Structured output.") }),

                Cmd("action runtime-compile", "Compile action JSON to Script SDK JS and Roslyn C# via ActionToScriptCompiler.", "qkrpc action runtime-compile --id <guid> [--json] [--out <file.cs>] [--script-out <file.js>] | qkrpc action runtime-compile --dir <project> [--json] | qkrpc action runtime-compile --package-file <path> [--json] | qkrpc action runtime-compile --xaction-file <path|-> [--json]",

                    opts: new[] { Option("id", "Action id (fetch from Quicker when no local project)."), Option("dir", "Local .quicker project dir."), Option("package-file", "ActionExecutionPackage JSON."), Option("xaction-file", "Program JSON file or -."), Option("out", "Write csharpScript to UTF-8 file."), Option("script-out", "Write intermediate JavaScript to UTF-8 file."), Option("json", "Structured output with script + csharpScript.") }),

                Cmd("action runtime-benchmark", "Mock-mode benchmark: JSON step dispatch vs Roslyn C# script (compile timed separately; Roslyn runner cached).", "qkrpc action runtime-benchmark --id <guid> [--json] [--warmup N] [--iterations N] | qkrpc action runtime-benchmark --package-file <path> [--json] | qkrpc action runtime-benchmark --xaction-file <path|-> [--json]",

                    opts: new[] { Option("id", "Action id (fetch from Quicker when no local project)."), Option("package-file", "ActionExecutionPackage JSON."), Option("xaction-file", "Program JSON file or -."), Option("warmup", "Warmup iterations (default 3)."), Option("iterations", "Measurement iterations (default 20)."), Option("benchmark-force-gc", "Force GC between modes."), Option("json", "Structured timing output.") }),

                Cmd("action runtime-keys", "List stepRunnerKey values supported by ActionRuntime.", "qkrpc action runtime-keys [--json]",

                    opts: new[] { Option("json", "Structured output.") }),

                Cmd("action float", "Show a local action as a floating button.", "qkrpc action float --id <idOrName> [--json]",

                    opts: new[] { Option("id", "Action id or name."), Option("json", "Structured output.") }),

                Cmd("action edit", "Open action editor UI.", "qkrpc action edit --id <guid> [--json]",

                    opts: new[] { Option("id", "Action GUID."), Option("json", "Structured output.") }),

                Cmd("action edit-var", "Edit variable default headlessly.", "qkrpc action edit-var --id <id> --var <key> --value <val> [--json]",

                    opts: new[] { Option("id", "Subprogram or action id."), Option("var", "Variable key."), Option("value", "New default."), Option("json", "Structured output.") }),

                Cmd("step-runner search", "Search StepRunner catalog (| OR, * wildcard). Non-empty query: items[].controlField on control-field modules (use value for get --control-field). Primary way to pick stepRunnerKey before get.", "qkrpc step-runner search --query <keyword> [--limit 40] [--json]",

                    opts: new[] { Option("query", "Filter: AND with spaces, OR with |, * wildcard.", shortName: "q"), Option("limit", "Max results.", defaultValue: "40"), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("step-runner get", "Agent step-runner schema (compressed, no icon): input keys/types before patch. Use --control-field when search returned controlField.", "qkrpc step-runner get --key <stepRunnerKey> [--control-field <value>] [--json]",

                    opts: new[] { Option("key", "StepRunner key."), Option("control-field", "Control-field value (from search items[].controlField.value)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("step-runner get-ui", "UI step-runner schema (full JSON with icon and control options). For action-editor only; agents use step-runner get.", "qkrpc step-runner get-ui --key <stepRunnerKey> [--control-field <value>] [--json]",

                    opts: new[] { Option("key", "StepRunner key."), Option("control-field", "Control-field value."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("fa resolve", "Resolve fa: specs to SVG path data (for UIs).", "qkrpc fa resolve --spec fa:Light_Flask [--json] | qkrpc fa resolve --specs '[\"fa:Light_A\"]' --json",
                    opts: new[] { Option("spec", "Single fa: icon spec."), Option("specs", "JSON array of fa: specs (batch, max 80 unique)."), Option("json", "Structured output: items[] with path, width, height."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),
                Cmd("fa search", "Search FA icons (see guide action-icons). Default: Light_* + Brands_*; --expand: all styles.", "qkrpc fa search [--query <keyword>] [--limit 40] [--expand] [--json]",

                    opts: new[] { Option("query", "Filter: AND with spaces, OR with |, * wildcard.", shortName: "q"), Option("limit", "Max results (unique glyphs default, or rows with --expand).", defaultValue: "40"), Option("expand", "No compress: all style rows (Solid/Regular/Light/…)."), Option("all-styles", "Alias for --expand."), Option("json", "Structured output: names[] (Light_*|Brands_*). Spec: fa:{name} or fa:{name}:{#color} (action-icons)."), Option("timeout", "Seconds.", defaultValue: "10"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("form validate", "Validate qkrpc.form.v1 spec (no Quicker). --json includes formSchema (qkrpc.form-spec.v1).", "qkrpc form validate --file <path|-> [--json]",

                    opts: new[] { Option("spec", "Inline form spec JSON."), Option("file", "Form spec file or - for stdin."), Option("json", "Structured output.") }),

                Cmd("form build", "Compile qkrpc.form.v1 to sys:form step JSON. --json includes formSchema + formTemplate.", "qkrpc form build --file <path|-> [--json]",

                    opts: new[] { Option("spec", "Inline form spec JSON."), Option("file", "Form spec file or - for stdin."), Option("json", "Structured output: nativeFormJson + step.") }),

                Cmd("expr check", "Compile-check Quicker expression ($= / sys:evalexpression). Requires Quicker + plugin.", "qkrpc expr check --code <text> | --file <path|-> [--variables '{\"k\":\"string\"}'] [--json]",

                    opts: new[] { Option("code", "Inline expression."), Option("file", "Expression file or - for stdin."), Option("variables", "JSON map: variable name -> C# type."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("expr run", "Execute Quicker expression ($= / sys:evalexpression) in Quicker via Z.Expressions.", "qkrpc expr run --code <text> | --file <path|-> [--variables-file vars.json] [--on-ui-thread] [--json]",

                    opts: new[] { Option("code", "Inline expression."), Option("file", "Expression file or - for stdin."), Option("variables", "JSON map: variable name -> value."), Option("variables-file", "JSON file with variable values."), Option("on-ui-thread", "Run on UI thread."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("chrome run", "Control user's browser via Quicker Connector (sys:chromecontrol). Preserves login state.", "qkrpc chrome run --operation OpenUrl --params '{\"url\":\"https://example.com\",\"windowId\":\"New\"}' [--session id] [--json]",

                    opts: new[] { Option("operation", "OpenUrl | RunScript | GetTabInfo | ActivateTab | …"), Option("params", "JSON inputParams object."), Option("params-file", "JSON file for parameters."), Option("session", "Session id for context reuse."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("chrome tabs", "List tabs in browsers connected to Quicker.", "qkrpc chrome tabs [--json]",

                    opts: new[] { Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("script check", "Compile-check sys:csscript C# snippet (Roslyn). Requires Quicker + plugin.", "qkrpc script check --code <text> | --file <path|-> [--references <paths>] [--json]",

                    opts: new[] { Option("code", "Inline C# script."), Option("file", "Script file or - for stdin."), Option("references", "Extra assembly paths (one per line)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings list", "List or search Quicker settings keys (empty query = browse by scope; with --query = keyword search incl. pages).", "qkrpc settings list [--scope userSettings] [--query <keyword>] [--limit 100] [--json] | qkrpc settings search --query <keyword> (alias)",

                    opts: new[] { Option("query", "Optional keyword (Chinese/English/property name); omit to list by scope.", shortName: "q"), Option("scope", "userSettings | userPreference | globalSettings | exeSettings (browse only)."), Option("limit", "Max results.", defaultValue: "100"), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings search", "Alias for settings list --query (keyword search).", "qkrpc settings search --query <keyword> [--limit 30] [--json]",

                    opts: new[] { Option("query", "Keyword (Chinese/English/property name).", shortName: "q"), Option("limit", "Max results.", defaultValue: "30"), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings get", "Read a Quicker setting value.", "qkrpc settings get --key userSettings:EnableCircleMenu [--json]",

                    opts: new[] { Option("key", "scope:path (exeSettings:<exe>:<path> for per-exe settings)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings set", "Update and persist a Quicker setting value.", "qkrpc settings set --key userSettings:EnableCircleMenu --value true [--json]",

                    opts: new[] { Option("key", "scope:path."), Option("value", "New value (bool/int/string/enum)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings apply", "Update multiple Quicker settings headlessly (no UI).", "qkrpc settings apply --changes-file changes.json [--json] | qkrpc settings apply --changes '{\"userSettings:EnableCircleMenu\":\"false\"}'",

                    opts: new[] { Option("changes", "JSON array [{key,value}] or object map."), Option("changes-file", "Path to JSON file (or -)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings pages", "List openable Quicker settings pages and UI targets.", "qkrpc settings pages [--json]",

                    opts: new[] { Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings links", "List preset direct links for one-step settings open.", "qkrpc settings links [--json] | qkrpc settings open --preset hotkeys",

                    opts: new[] { Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings open", "Open Quicker settings UI. Prefer --preset for one-step open (see settings links).", "qkrpc settings open --preset hotkeys [--json] | qkrpc settings open --page recycle-bin | qkrpc settings open --query 批量更新",

                    opts: new[] { Option("preset", "Direct link preset id or alias (hotkeys, recycle-bin, …)."), Option("link", "Alias for --preset."), Option("page", "SettingPageId or alias."), Option("target", "Alias for --page."), Option("query", "Resolve page by keyword when --preset/--page omitted.", shortName: "q"), Option("key", "Open page containing this setting key."), Option("search-text", "Prefill Quicker search window."), Option("exe", "With exe-settings / process-settings target."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("settings resolve", "Dry-run: resolve user query/preset/key to settings UI or headless target (no UI). For agent intent tests.", "qkrpc settings resolve --query \"打开动作回收站\" [--json] | qkrpc settings resolve --preset hotkeys",

                    opts: new[] { Option("query", "Natural language or keyword query.", shortName: "q"), Option("preset", "Direct link preset id or alias."), Option("link", "Alias for --preset."), Option("key", "Setting key to resolve containing page."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger list", "List event trigger tasks (automation rules: run action on window/process/clipboard/file/timer events).", "qkrpc trigger list [--query <keyword>] [--event WindowActivated] [--json]",

                    opts: new[] { Option("query", "Filter by note/event/action/id keyword.", shortName: "q"), Option("event", "Filter by event type (case sensitive)."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger events", "List supported trigger event types with accepted params and event variables.", "qkrpc trigger events [--event FileSystemChange] [--json]",

                    opts: new[] { Option("event", "Show one event type only."), Option("json", "Structured output (fields + variables)."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger add", "Create an event trigger task. Always check 'trigger events --json' first for the exact event type and param keys.", "qkrpc trigger add --event ProcessStarted --action <actionIdOrName> --params '{\"ProcessName\":\"notepad\"}' [--note 说明] [--json]",

                    opts: new[] { Option("event", "Event type id, case sensitive."), Option("action", "Action id (Guid) or action title to run."), Option("action-param", "Parameter passed to the action."), Option("params", "JSON object of event params."), Option("params-file", "JSON file with event params."), Option("note", "Display note."), Option("filter", "Event filter expression."), Option("machines", "Machine binding."), Option("debounce", "Debounce ms."), Option("throttle", "Throttle ms."), Option("delay", "Delay ms before running action."), Option("skip-further", "Skip remaining rules for same event."), Option("disabled", "Create disabled."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger update", "Update an event trigger task (only provided options change).", "qkrpc trigger update --id <guid> [--params '{...}'] [--enabled|--disabled] [--note 新说明] [--json]",

                    opts: new[] { Option("id", "Trigger task id."), Option("event", "New event type."), Option("action", "New action id or title."), Option("action-param", "New action parameter."), Option("params", "Replace event params (JSON object)."), Option("note", "New note."), Option("enabled", "Enable the rule."), Option("disabled", "Disable the rule."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger delete", "Delete an event trigger task.", "qkrpc trigger delete --id <guid> [--json]",

                    opts: new[] { Option("id", "Trigger task id."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("trigger enable", "Enable / disable an event trigger task.", "qkrpc trigger enable --id <guid> [--json] | qkrpc trigger disable --id <guid> [--json]",

                    opts: new[] { Option("id", "Trigger task id."), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("launcher resolve", "Unified launcher resolve: search settings/actions/subprograms, score and rank candidates for agent pick.", "qkrpc launcher resolve --query \"打开功能快捷键\" [--scopes settings,actions] [--limit 12] [--json]",

                    opts: new[] { Option("query", "User phrase to resolve.", shortName: "q"), Option("scopes", "Optional filter: settings,actions,subprograms."), Option("limit", "Max candidates (1-30).", defaultValue: "12"), Option("json", "Structured output."), Option("timeout", "Seconds.", defaultValue: "30"), Option("no-bootstrap", "Skip auto-start.") }),

                Cmd("project.lint.schedule", "Schedule async expression/C# lint for a .quicker project (qkrpc serve). Writes .qkrpc/diagnostics.json.", "POST serve op project.lint.schedule — args: projectDir, workspaceRoot, target, id, editVersion",

                    opts: new[] { Option("projectDir", "Absolute project directory."), Option("workspaceRoot", "Workspace root for path guard."), Option("target", "action | global_subprogram | embedded_subprogram."), Option("id", "Action or subprogram id."), Option("editVersion", "From last patch.") }),

                Cmd("project.diagnostics.get", "Read program syntax diagnostics snapshot (qkrpc serve).", "POST serve op project.diagnostics.get — args: projectDir, waitMs, editVersion",

                    opts: new[] { Option("projectDir", "Absolute project directory."), Option("waitMs", "Wait for running lint (0–120000)."), Option("editVersion", "Detect stale snapshot.") }),

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

            Option("context-menu-data", "Context menu lines (CommonOperationItem text; empty string clears)."),

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

            Option("min-lines", "Externalize inline values with more than N lines.", defaultValue: "4"),

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



    private static object[] AgentSetupOptions() =>

        new object[]

        {

            Option("check", "Verify ~/.qkrpc/agent-setup.json matches CLI version."),

            Option("upgrade", "Refresh skills, rules, Claude guidance only (skip MCP config)."),

            Option("cursor", "Write ~/.cursor/mcp.json (default when no agent flag)."),

            Option("claude", "Write Claude Desktop config."),

            Option("vscode", "Write VS Code / Copilot user mcp.json."),

            Option("windsurf", "Write ~/.codeium/windsurf/mcp_config.json."),

            Option("cline", "Write Cline cline_mcp_settings.json."),

            Option("codex", "Codex: codex mcp add + optional project AGENTS.md (--project)."),

            Option("all", "Write all supported user-level MCP configs."),

            Option("project", "Also write .cursor/.vscode/.mcp.json in cwd."),

            Option("project-skills", "With --project: also copy skills to .cursor/skills/."),

            Option("workspace", "QKRPC_WORKSPACE_ROOT for MCP env."),

            Option("skill-source", "Path to docs/skills root or a single skill directory."),

            Option("skip-skill", "Skip skill copy."),

            Option("json", "Emit JSON to stdout (install result or --check report)."),

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

