import { existsSync, readFileSync } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import { AppKvKey, readAppKvJson } from "@/lib/db/app-kv";
import { resolveLegacyPersistedJsonPaths } from "@/lib/quicker-agent-persisted-data";
import {
  formatLauncherResolveForAgent,
  isLauncherResolveDirectEligible,
} from "@/lib/launcher/launcher-resolve-agent-output";
import { setLauncherResolveDirectNext } from "@/lib/qkrpc-request-context";
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
  const fromKv = readAppKvJson<LauncherResolvePresetsFile>(AppKvKey.launcherResolvePresets);
  if (fromKv) return fromKv;
  for (const path of resolveLegacyPersistedJsonPaths("launcher-resolve-presets.json")) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as LauncherResolvePresetsFile;
    } catch {
      // try next path
    }
  }
  return null;
}

export async function executeLauncherResolveTool(
  input: LauncherResolveToolInput,
): Promise<Record<string, unknown>> {
  const userPresets = input.skipPresets ? null : await loadUserResolvePresets();
  const resolved = await resolveLauncherCandidates(input, userPresets);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, query: resolved.query || undefined };
  }
  const output = formatLauncherResolveForAgent(resolved.query, resolved.candidates, {
    queryTerms: resolved.queryTerms,
    missedTerms: resolved.missedTerms,
  });
  if (
    output.next
    && !output.disambiguationRequired
    && isLauncherResolveDirectEligible(resolved.candidates)
  ) {
    setLauncherResolveDirectNext(output.next);
  } else {
    setLauncherResolveDirectNext(null);
  }
  return output;
}

export const LAUNCHER_RESOLVE_TOOL_DEF = tool({
  description:
    "Launcher only: map user phrase → ranked matches. Returns { ok, next? } when direct-eligible, "
    + "else { disambiguationRequired, ranked } — use ask_question before run. "
    + "Prefer over qkrpc_action_query for run/open intent. NOT for program body edits.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Keywords; use | for OR alternatives and * wildcards. "
        + "Prefer several synonyms: 动作管理器|搜索动作|动作页|ActionManage. "
        + "Example: 打开功能快捷键 | 运行剪贴板*动作",
      ),
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
