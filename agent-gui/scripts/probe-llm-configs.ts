#!/usr/bin/env tsx
/**
 * Batch-probe LLM endpoints from publish/dev/merged config and llm-config.json.
 *
 * Usage:
 *   pnpm probe:llm-configs
 *   pnpm probe:llm-configs -- --source publish --method models
 *   pnpm probe:llm-configs -- --source all --method chat --json
 */

import {
  parseLlmProbeConfigSource,
  parseLlmProbeMethod,
  runLlmEndpointProbeReport,
  type LlmEndpointProbeRow,
} from "../lib/llm-endpoint-probe-core";
import { listLlmProbeTargetsFromFiles } from "../lib/llm-endpoint-probe-files";

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function printRow(row: LlmEndpointProbeRow): void {
  const status = row.ok ? "OK" : "FAIL";
  const sources = row.sources.join(",");
  console.log(
    [
      status.padEnd(4),
      `${row.latencyMs}ms`.padStart(7),
      (row.groupLabel ?? row.group ?? "").slice(0, 14).padEnd(14),
      (row.model ?? "-").slice(0, 28).padEnd(28),
      row.host.slice(0, 24).padEnd(24),
      row.maskedKey.padEnd(12),
      sources.slice(0, 18).padEnd(18),
      row.message.slice(0, 48),
    ].join("  "),
  );
}

function printTable(rows: readonly LlmEndpointProbeRow[]): void {
  console.log(
    [
      "stat",
      "     ms",
      "group",
      "model",
      "host",
      "key",
      "sources",
      "detail",
    ].join("  "),
  );
  console.log("-".repeat(130));
  for (const row of rows) printRow(row);
}

async function main(): Promise<void> {
  const source = parseLlmProbeConfigSource(readArg("--source"));
  const method = parseLlmProbeMethod(readArg("--method"));
  const timeoutMs = Number(readArg("--timeout") ?? process.env.LLM_PROBE_TIMEOUT_MS ?? "12000");
  const json = hasFlag("--json");

  const report = await runLlmEndpointProbeReport({
    source,
    method,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 12_000,
    includeAutoModels: !hasFlag("--no-auto"),
    listTargets: listLlmProbeTargetsFromFiles,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Probing source=${source} method=${method} timeout=${report.timeoutMs}ms `
      + `(${report.summary.total} endpoint(s))…\n`,
    );
    printTable(report.rows);
    if (report.autoModels?.length) {
      console.log("\nAuto model candidates (chat):");
      printTable(report.autoModels);
    }
    console.log("\nSummary by group:");
    for (const [label, stats] of Object.entries(report.summary.byGroup)) {
      const reachable = stats.reachable ? "reachable" : "unreachable";
      console.log(`  ${label}: ${stats.ok}/${stats.ok + stats.fail} OK (${reachable})`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
