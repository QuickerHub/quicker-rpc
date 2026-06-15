/**
 * Compare cursor-sdk vs agent-gui eval reports for the same task ids.
 *
 *   pnpm agent-eval:compare -- --preset l2-core --limit 3
 */
import { readdirSync, readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { defaultWorkspaceRoot } from "@/lib/agent-eval/eval-scenario";
import { resolveEvalScenarioIds } from "@/lib/agent-eval/eval-scenario";
import type { AgentEvalReport } from "@/lib/agent-eval/types";

function workspaceRoot(): string {
  return defaultWorkspaceRoot();
}

function latestReport(dir: string, taskId: string): AgentEvalReport | null {
  if (!dir) return null;
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(`${taskId}-`) && f.endsWith(".json"));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  files.sort();
  const latest = files.at(-1)!;
  return JSON.parse(readFileSync(join(dir, latest), "utf8")) as AgentEvalReport;
}

function parseArgs(argv: string[]): {
  preset?: string;
  limit?: number;
  json: boolean;
} {
  const json = argv.includes("--json");
  const presetIdx = argv.indexOf("--preset");
  const preset = presetIdx >= 0 ? argv[presetIdx + 1] : "l2-core";
  const limitIdx = argv.indexOf("--limit");
  const limitRaw = limitIdx >= 0 ? argv[limitIdx + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;
  return {
    preset,
    limit: Number.isFinite(limit) ? limit : undefined,
    json,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const taskIds = resolveEvalScenarioIds({
    preset: args.preset,
    limit: args.limit,
  });
  const root = workspaceRoot();
  const sdkDir = join(root, ".local", "cursor-sdk");
  const guiDir = join(root, ".local", "agent-eval");

  const rows = taskIds.map((taskId) => {
    const sdk = latestReport(sdkDir, taskId);
    const gui = latestReport(guiDir, taskId);
    const sdkOk = sdk?.status === "finished" && (sdk.mockVerify?.ok ?? true);
    const guiOk =
      gui?.status === "finished"
      && (gui.traceRubric?.passed ?? true)
      && (gui.mockVerify?.ok ?? true);
    return {
      taskId,
      sdk: sdk
        ? { status: sdk.status, mockOk: sdk.mockVerify?.ok, tools: sdk.toolCalls?.length }
        : null,
      gui: gui
        ? {
            status: gui.status,
            traceOk: gui.traceRubric?.passed,
            mockOk: gui.mockVerify?.ok,
            tools: gui.toolCalls?.length,
          }
        : null,
      parity: sdkOk === guiOk ? (sdkOk ? "both_pass" : "both_fail") : "mismatch",
    };
  });

  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    for (const row of rows) {
      console.log(
        `${row.taskId}\tsdk=${row.sdk?.status ?? "missing"}\tgui=${row.gui?.status ?? "missing"}\t${row.parity}`,
      );
    }
    const mismatches = rows.filter((r) => r.parity === "mismatch").length;
    console.error(`\nparity mismatches: ${mismatches}/${rows.length}`);
    if (mismatches > 0) process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
