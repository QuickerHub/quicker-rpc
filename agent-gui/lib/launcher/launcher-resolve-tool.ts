import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import { formatLauncherResolveForAgent } from "@/lib/launcher/launcher-resolve-agent-output";
import {
  resolveLauncherCandidates,
  type LauncherResolveToolInput,
} from "@/lib/launcher/launcher-resolve-core";
import type { LauncherResolvePresetsFile } from "@/lib/launcher/launcher-resolve-presets";

export type { LauncherResolveToolInput } from "@/lib/launcher/launcher-resolve-core";

export const LAUNCHER_RESOLVE_TOOL = "launcher_resolve";

const scopesSchema = z
  .enum(["settings", "actions", "subprograms"])
  .array()
  .optional();

async function loadUserResolvePresets(): Promise<LauncherResolvePresetsFile | null> {
  const path = resolvePersistedDataFilePath("launcher-resolve-presets.json");
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as LauncherResolvePresetsFile;
  } catch {
    return null;
  }
}

export async function executeLauncherResolveTool(
  input: LauncherResolveToolInput,
): Promise<Record<string, unknown>> {
  const userPresets = input.skipPresets ? null : await loadUserResolvePresets();
  const resolved = await resolveLauncherCandidates(input, userPresets);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, query: resolved.query || undefined };
  }
  return formatLauncherResolveForAgent(resolved.query, resolved.candidates);
}

export const LAUNCHER_RESOLVE_TOOL_DEF = tool({
  description:
    "Launcher resolve: map user phrase → one next tool call. Returns compact JSON: "
    + "{ ok, next: { tool, input }, alternatives? }. Call this when intent is unclear; "
    + "then immediately execute next with the same arguments. Do not re-search if next is present.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("User phrase or keywords, e.g. 打开功能快捷键 / 运行剪贴板动作"),
    scopes: scopesSchema.describe(
      "Optional search domains; default searches all",
    ),
    limit: z.number().int().min(1).max(30).optional().describe("Max RPC candidates (default 8)"),
    skipPresets: z
      .boolean()
      .optional()
      .describe("Skip user preset score adjustments"),
  }),
  execute: executeLauncherResolveTool,
});
