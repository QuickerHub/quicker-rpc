import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  deleteLauncherCommandCacheEntry,
  getLauncherCommandCacheEntry,
  listLauncherCommandCacheEntries,
  saveLauncherCommandCacheEntry,
} from "@/lib/launcher/launcher-command-cache.server";

export const LAUNCHER_COMMAND_CACHE_TOOL = "launcher_command_cache";

const cacheActionSchema = z.enum(["save", "delete", "list", "get"]);

const cachedStepSchema = z.object({
  toolName: z.string().describe("Tool id, e.g. quicker_settings"),
  input: z
    .record(z.string(), z.unknown())
    .describe("Exact tool input object used successfully"),
});

export const LAUNCHER_COMMAND_CACHE_TOOL_DEF = tool({
  description:
    "Persist reusable launcher command recipes (user phrase → tool call sequence). "
    + "After a successful one-shot launcher run with a stable mapping, action=save so "
    + "future matching user phrases skip slow re-planning. action=list/get/delete for maintenance. "
    + "Only available in launcher mode.",
  inputSchema: z.object({
    action: cacheActionSchema,
    trigger: z
      .string()
      .optional()
      .describe('User phrase for save, e.g. "打开动作回收站"'),
    aliases: z
      .array(z.string())
      .optional()
      .describe("Optional extra phrases that mean the same thing"),
    steps: z
      .array(cachedStepSchema)
      .optional()
      .describe("Ordered successful tool calls for save"),
    note: z
      .string()
      .optional()
      .describe("Optional short hint for future runs"),
    id: z.string().optional().describe("Entry id for delete/get"),
  }),
  execute: async (input) => {
    switch (input.action) {
      case "save": {
        if (!input.trigger?.trim()) {
          return formatLocalToolResult({
            action: "launcher-command-cache-save",
            success: false,
            error: "trigger is required for save",
          });
        }
        if (!input.steps?.length) {
          return formatLocalToolResult({
            action: "launcher-command-cache-save",
            success: false,
            error: "steps is required for save",
          });
        }
        const result = saveLauncherCommandCacheEntry({
          trigger: input.trigger,
          steps: input.steps,
          aliases: input.aliases,
          note: input.note,
        });
        if (!result.ok) {
          return formatLocalToolResult({
            action: "launcher-command-cache-save",
            success: false,
            error: result.error,
          });
        }
        return formatLocalToolResult({
          action: "launcher-command-cache-save",
          success: true,
          entry: {
            id: result.entry.id,
            trigger: result.entry.trigger,
            aliases: result.entry.aliases,
            stepCount: result.entry.steps.length,
            steps: result.entry.steps,
          },
        });
      }
      case "delete": {
        if (!input.id?.trim()) {
          return formatLocalToolResult({
            action: "launcher-command-cache-delete",
            success: false,
            error: "id is required for delete",
          });
        }
        const result = deleteLauncherCommandCacheEntry(input.id);
        if (!result.ok) {
          return formatLocalToolResult({
            action: "launcher-command-cache-delete",
            success: false,
            error: result.error,
          });
        }
        return formatLocalToolResult({
          action: "launcher-command-cache-delete",
          success: true,
          id: input.id.trim(),
        });
      }
      case "list": {
        const entries = listLauncherCommandCacheEntries();
        return formatLocalToolResult({
          action: "launcher-command-cache-list",
          success: true,
          count: entries.length,
          entries: entries.map((entry) => ({
            id: entry.id,
            trigger: entry.trigger,
            aliases: entry.aliases,
            stepCount: entry.steps.length,
            useCount: entry.useCount,
            lastUsedAt: entry.lastUsedAt,
            note: entry.note,
          })),
        });
      }
      case "get": {
        if (!input.id?.trim()) {
          return formatLocalToolResult({
            action: "launcher-command-cache-get",
            success: false,
            error: "id is required for get",
          });
        }
        const entry = getLauncherCommandCacheEntry(input.id);
        if (!entry) {
          return formatLocalToolResult({
            action: "launcher-command-cache-get",
            success: false,
            error: `entry not found: ${input.id.trim()}`,
          });
        }
        return formatLocalToolResult({
          action: "launcher-command-cache-get",
          success: true,
          entry,
        });
      }
      default:
        return formatLocalToolResult({
          action: "launcher-command-cache",
          success: false,
          error: "unknown action",
        });
    }
  },
});
