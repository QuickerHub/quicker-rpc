import { tool } from "ai";
import { z } from "zod";
import { formatQkrpcResultForAgent, runQkrpcForTool } from "@/lib/qkrpc";

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
  "pages",
  "open",
]);

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
  exe?: string;
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
    case "search": {
      if (!input.query?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "query is required when action=search",
          parsed: null,
          truncated: false,
        });
      }
      const args = buildSettingsArgs("search", [
        "--query",
        input.query,
        input.limit != null ? "--limit" : undefined,
        input.limit != null ? String(input.limit) : undefined,
      ]);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
    }
    case "list": {
      const args = buildSettingsArgs("list", [
        input.scope ? "--scope" : undefined,
        input.scope,
        input.limit != null ? "--limit" : undefined,
        input.limit != null ? String(input.limit) : undefined,
      ]);
      return formatQkrpcResultForAgent(await runQkrpcForTool(args));
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
    case "pages":
      return formatQkrpcResultForAgent(
        await runQkrpcForTool(["settings", "pages"]),
      );
    case "open": {
      if (!input.page?.trim()) {
        return formatQkrpcResultForAgent({
          ok: false,
          exitCode: 1,
          stdout: "",
          stderr: "page is required when action=open",
          parsed: null,
          truncated: false,
        });
      }
      const args = buildSettingsArgs("open", [
        "--page",
        input.page,
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
    "Quicker application settings and UI (via qkrpc serve). "
    + "action=open: settings page/window (recycle-bin/动作回收站, AppSettings/常规设置, search). "
    + "Action recycle bin is a settings page — NOT action list scope. "
    + "action=search/list/get/set for preferences; action=pages lists open targets. "
    + "See docs topic quicker-ui.",
  inputSchema: z.object({
    action: settingsActionSchema.describe(
      "search | list | get | set | pages | open",
    ),
    query: z
      .string()
      .optional()
      .describe("Keyword for action=search"),
    scope: settingsScopeSchema.describe("Scope for action=list"),
    limit: z.number().int().min(1).max(500).optional(),
    key: z.string().optional().describe("Setting key for get/set"),
    value: z
      .string()
      .optional()
      .describe("New value string for action=set"),
    page: z
      .string()
      .optional()
      .describe("Page id or alias for action=open"),
    exe: z
      .string()
      .optional()
      .describe("exeFile for action=open page exe-settings"),
  }),
  execute: executeQuickerSettingsTool,
});
