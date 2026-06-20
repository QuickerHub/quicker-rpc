/**
 * Static shell token baseline via dev API (requires agent-gui dev server).
 *
 *   pnpm measure:static-shell
 *   pnpm measure:static-shell -- --cwd benchmarks/fixtures/eval-workspace
 *   pnpm measure:static-shell -- --base http://127.0.0.1:3000 --json-only
 *   pnpm measure:static-shell -- --fail-over-target
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StaticShellBaselineReport } from "../lib/agent-harness/static-shell-baseline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = path.resolve(__dirname, "..");
const defaultFixtureCwd = path.join(agentGuiRoot, "benchmarks/fixtures/eval-workspace");

function parseArgs(argv: string[]) {
  const cwdIdx = argv.indexOf("--cwd");
  const baseIdx = argv.indexOf("--base");
  const jsonOnly = argv.includes("--json-only");
  const failOverTarget = argv.includes("--fail-over-target");
  const cwd =
    cwdIdx >= 0
      ? path.resolve(argv[cwdIdx + 1] ?? defaultFixtureCwd)
      : defaultFixtureCwd;
  const base =
    (baseIdx >= 0 ? argv[baseIdx + 1] : process.env.AGENT_GUI_EVAL_BASE_URL)
    ?? "http://127.0.0.1:3000";
  return { cwd, base: base.replace(/\/$/, ""), jsonOnly, failOverTarget };
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/ping`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`agent-gui not reachable at ${baseUrl} — start: pwsh ./dev.ps1`);
}

async function fetchBaseline(base: string, cwd: string): Promise<StaticShellBaselineReport> {
  const res = await fetch(`${base}/api/dev/static-shell-baseline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, chatMode: "agent" }),
  });
  const data = (await res.json()) as { report?: StaticShellBaselineReport; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  if (!data.report) {
    throw new Error("missing report in response");
  }
  return data.report;
}

function printHumanSummary(report: StaticShellBaselineReport) {
  console.log(`Static shell baseline · ${report.chatMode} · ${report.cwd}`);
  console.log(
    `Harness: skillsFull=${report.harnessFlags.preloadSkillsFull}`
    + ` rulesFull=${report.harnessFlags.workspaceRulesFull}`
    + ` l1Compress=${report.harnessFlags.toolResultCompression}`
    + ` slimSchemas=${report.harnessFlags.slimToolSchemas}`,
  );
  console.log("");
  console.log("Segments (tokens):");
  for (const segment of report.segments) {
    console.log(
      `  ${segment.label.padEnd(32)} ${String(segment.tokens).padStart(6)} tok  (${segment.chars.toLocaleString()} chars)`,
    );
  }
  console.log("");
  console.log(
    `System prompt: ${report.systemPromptTokens.toLocaleString()} tok`
    + ` · Tools (${report.toolCount}): ${report.toolDefinitionTokens.toLocaleString()} tok`
    + (report.toolDefinitionTokensFull != null
      ? ` (full schemas: ${report.toolDefinitionTokensFull.toLocaleString()} tok`
        + (report.slimExtendedToolCount != null
          ? `, ${report.slimExtendedToolCount} slimmed`
          : "")
        + ")"
      : "")
    + ` · Total static: ${report.totalStaticTokens.toLocaleString()} tok`,
  );
  console.log(
    `Target system ≤ ${report.targets.systemTokens.toLocaleString()} tok:`
    + ` ${report.targets.systemWithinTarget ? "OK" : "OVER"}`,
  );
  console.log(
    `Tool budget ≤ ${report.targets.toolsBudgetTokens.toLocaleString()} tok:`
    + ` ${report.targets.toolsWithinBudget ? "OK" : "OVER"}`,
  );
}

async function main() {
  const { cwd, base, jsonOnly, failOverTarget } = parseArgs(process.argv.slice(2));
  await waitForServer(base);
  const report = await fetchBaseline(base, cwd);

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanSummary(report);
    console.log("");
    console.log(JSON.stringify(report, null, 2));
  }

  if (failOverTarget && !report.targets.systemWithinTarget) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
