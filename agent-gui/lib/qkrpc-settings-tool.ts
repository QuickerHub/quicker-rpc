import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";

export const QUICKER_SETTINGS_TOOL = "quicker_settings";

/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_SEARCH_TOOL = "qkrpc_settings_search";
/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_LIST_TOOL = "qkrpc_settings_list";
/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_GET_TOOL = "qkrpc_settings_get";
/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_SET_TOOL = "qkrpc_settings_set";
/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_PAGES_TOOL = "qkrpc_settings_pages";
/** @deprecated Use quicker_settings */
export const QKRPC_SETTINGS_OPEN_TOOL = "qkrpc_settings_open";

const settingsActionSchema = z.enum([
  "search",
  "list",
  "get",
  "set",
  "apply",
  "pages",
  "links",
  "open",
]);

const settingChangeSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const settingsScopeSchema = z
  .enum(["userSettings", "userPreference", "globalSettings", "exeSettings"])
  .optional();

export type QuickerSettingsToolInput = {
  action: z.infer<typeof settingsActionSchema>;
  query?: string;
  scope?: z.infer<typeof settingsScopeSchema>;
  limit?: number;
  key?: string;
  value?: string;
  page?: string;
  preset?: string;
  exe?: string;
  searchText?: string;
  changes?: Array<{ key: string; value: string }>;
  patch?: Record<string, string>;
};

function buildSettingsArgs(
  verb: string,
  flags: Array<string | undefined>,
): string[] {
  const args = ["settings", verb];
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i];
    const value = flags[i + 1];
    if (flag && value != null && String(value).length > 0) {
      args.push(flag, String(value));
    }
  }
  return args;
}

function buildSettingsListArgs(input: QuickerSettingsToolInput): string[] {
  return buildSettingsArgs("list", [
    input.query?.trim() ? "--query" : undefined,
    input.query?.trim(),
    input.scope ? "--scope" : undefined,
    input.scope,
    input.limit != null ? "--limit" : undefined,
    input.limit != null ? String(input.limit) : undefined,
  ]);
}

export function isQuickerSettingsTool(toolName: string): boolean {
  return (
    toolName === QUICKER_SETTINGS_TOOL
    || toolName === QKRPC_SETTINGS_SEARCH_TOOL
    || toolName === QKRPC_SETTINGS_LIST_TOOL
    || toolName === QKRPC_SETTINGS_GET_TOOL
    || toolName === QKRPC_SETTINGS_SET_TOOL
    || toolName === QKRPC_SETTINGS_PAGES_TOOL
    || toolName === QKRPC_SETTINGS_OPEN_TOOL
  );
}

export async function executeQuickerSettingsTool(
  input: QuickerSettingsToolInput,
): Promise<Record<string, unknown>> {
  switch (input.action) {
    case "search":
    case "list": {
      if (input.action === "search" && !input.query?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "query is required when action=search (or use action=list to browse by scope)",
          parsed: null,
          truncated: false,
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(buildSettingsListArgs(input)),
      );
    }
    case "get": {
      if (!input.key?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "key is required when action=get",
          parsed: null,
          truncated: false,
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(buildSettingsArgs("get", ["--key", input.key])),
      );
    }
    case "set": {
      if (!input.key?.trim() || input.value === undefined) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "key and value are required when action=set",
          parsed: null,
          truncated: false,
        });
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(
          buildSettingsArgs("set", ["--key", input.key, "--value", input.value]),
        ),
      );
    }
    case "apply": {
      const changes = input.changes?.length
        ? input.changes
        : input.patch
          ? Object.entries(input.patch).map(([key, value]) => ({ key, value }))
          : [];
      if (changes.length === 0) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "changes[] or patch{} is required when action=apply",
          parsed: null,
          truncated: false,
        });
      }
      const http = await invokeQkrpcHttp({
        op: "settings.apply",
        args: { changes },
      });
      if (http) {
        return formatQkrpcResultForAgent(http);
      }
      return formatQkrpcResultForAgent(
        await runQkrpcForTool([
          "settings",
          "apply",
          "--changes",
          JSON.stringify(changes),
        ]),
      );
    }
    case "pages":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["settings", "pages"]),
      );
    case "links":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["settings", "links"]),
      );
    case "open": {
      if (
        !input.preset?.trim()
        && !input.page?.trim()
        && !input.query?.trim()
        && !input.key?.trim()
      ) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "preset, page, query, or key is required when action=open",
          parsed: null,
          truncated: false,
        });
      }
      const http = await invokeQkrpcHttp({
        op: "settings.open",
        args: {
          preset: input.preset?.trim() || undefined,
          page: input.page?.trim() || undefined,
          query: input.query?.trim() || undefined,
          key: input.key?.trim() || undefined,
          exe: input.exe?.trim() || undefined,
          searchText: input.searchText?.trim() || undefined,
        },
      });
      if (http) {
        return formatQkrpcResultForAgent(http);
      }
      const args = buildSettingsArgs("open", [
        input.preset ? "--preset" : undefined,
        input.preset,
        input.page ? "--page" : undefined,
        input.page,
        input.query ? "--query" : undefined,
        input.query,
        input.key ? "--key" : undefined,
        input.key,
        input.searchText ? "--search-text" : undefined,
        input.searchText,
        input.exe ? "--exe" : undefined,
        input.exe,
      ]);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    default: {
      const _exhaustive: never = input.action;
      return formatQkrpcResultForAgent({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: `Unknown action: ${String(_exhaustive)}`,
        parsed: null,
        truncated: false,
      });
    }
  }
}

export const QUICKER_SETTINGS_TOOL_DEF = tool({
  description:
    "Quicker desktop app settings — NOT agent-gui chat models (llm_settings). "
    + "Headless read/write via get/set/apply; open only when user needs the UI panel. "
    + "action=list: browse keys by scope, or pass query to search keys and settings pages. "
    + "action=search: alias for list with required query. "
    + "action=get/set: single key scope:path (e.g. userSettings:EnableCircleMenu). "
    + "action=apply: batch update via changes[] or patch map. "
    + "action=links: list preset direct links (one-step open ids). "
    + "action=open: prefer preset (hotkeys, recycle-bin, …); or page/query/key. "
    + "Boolean values: true/false or 1/0. See docs topic quicker-ui.",
  inputSchema: z.object({
    action: settingsActionSchema.describe(
      "list | search | get | set | apply | pages | links | open",
    ),
    query: z
      .string()
      .optional()
      .describe("Keyword for action=list (search) or required for action=search"),
    scope: settingsScopeSchema.describe("Scope for action=list when query is omitted"),
    limit: z.number().int().min(1).max(500).optional(),
    key: z.string().optional().describe("Setting key for get/set, or open (opens containing settings page)"),
    value: z
      .string()
      .optional()
      .describe("New value string for action=set"),
    preset: z
      .string()
      .optional()
      .describe("Direct link preset for action=open (see action=links). Preferred one-step open, e.g. hotkeys, recycle-bin"),
    page: z
      .string()
      .optional()
      .describe("Page id or alias for action=open (e.g. recycle-bin, AppSettings, search, exe-settings)"),
    exe: z
      .string()
      .optional()
      .describe("exeFile for action=open page exe-settings"),
    searchText: z
      .string()
      .optional()
      .describe("Prefill Quicker search window when opening search UI"),
    changes: z
      .array(settingChangeSchema)
      .optional()
      .describe("Batch changes for action=apply"),
    patch: z
      .record(z.string())
      .optional()
      .describe("Alternative batch map for action=apply (key → value)"),
  }),
  execute: executeQuickerSettingsTool,
});
