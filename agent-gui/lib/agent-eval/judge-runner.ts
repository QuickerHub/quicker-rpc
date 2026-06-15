import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultWorkspaceRoot } from "@/lib/agent-eval/eval-scenario";
import type { AgentEvalJudgeResult, AgentEvalReport } from "@/lib/agent-eval/types";

function repoRoot(): string {
  return defaultWorkspaceRoot();
}

/** Invoke scripts/sdk judge (Cursor SDK) on a saved report. */
export function runJudgeOnReport(
  reportPath: string,
): { judge: AgentEvalJudgeResult | null; report?: AgentEvalReport } {
  const sdkDir = join(repoRoot(), "scripts", "sdk");
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "judge", "--", reportPath, "--json", "--write"],
    {
      cwd: sdkDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    },
  );

  let judge: AgentEvalJudgeResult | null = null;
  const stdout = (result.stdout ?? "").trim();
  if (stdout) {
    try {
      judge = JSON.parse(stdout) as AgentEvalJudgeResult;
    } catch {
      judge = null;
    }
  }

  let report: AgentEvalReport | undefined;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8")) as AgentEvalReport;
  } catch {
    report = undefined;
  }

  if (!judge && result.status !== 0) {
    judge = {
      scores: {},
      notes: (result.stderr ?? "").trim() || "judge subprocess failed",
      passed: false,
    };
  }

  return { judge, report };
}
