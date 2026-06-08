#!/usr/bin/env tsx
/**
 * Batch-probe LLM endpoints from publish/dev/merged config and llm-config.json.
 *
 * Usage:
 *   pnpm probe:publish-config          # publish config, models + chat (recommended)
 *   pnpm probe:llm-configs               # all sources, models only
 *   pnpm probe:llm-configs -- --method full --source publish
 *   pnpm probe:llm-configs -- --method models --source publish
 *   pnpm probe:llm-configs -- --method chat --json
 *
 * From repo root:
 *   pwsh -NoProfile -File ./publish/Probe-LlmPublishConfig.ps1
 */

import {
  parseLlmProbeConfigSource,
  parseLlmProbeMethod,
  runLlmEndpointProbeReport,
  type LlmEndpointProbeRow,
  type LlmProbeMethod,
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

function checkLabel(row: LlmEndpointProbeRow, kind: "models" | "chat"): string {
  const check = row[kind];
  if (!check) return "-";
  return check.ok ? "OK" : "FAIL";
}

function printRow(row: LlmEndpointProbeRow, method: LlmProbeMethod): void {
  const status = row.ok ? "OK" : "FAIL";
  const sources = row.sources.join(",");
  const columns = method === "full"
    ? [
        status.padEnd(4),
        checkLabel(row, "models").padEnd(6),
        checkLabel(row, "chat").padEnd(5),
        `${row.latencyMs}ms`.padStart(7),
        (row.groupLabel ?? row.group ?? "").slice(0, 14).padEnd(14),
        (row.model ?? "-").slice(0, 24).padEnd(24),
        row.host.slice(0, 22).padEnd(22),
        row.maskedKey.padEnd(12),
        row.message.slice(0, 56),
      ]
    : [
        status.padEnd(4),
        `${row.latencyMs}ms`.padStart(7),
        (row.groupLabel ?? row.group ?? "").slice(0, 14).padEnd(14),
        (row.model ?? "-").slice(0, 28).padEnd(28),
        row.host.slice(0, 24).padEnd(24),
        row.maskedKey.padEnd(12),
        sources.slice(0, 18).padEnd(18),
        row.message.slice(0, 48),
      ];
  console.log(columns.join("  "));
}

function printTable(rows: readonly LlmEndpointProbeRow[], method: LlmProbeMethod): void {
  if (method === "full") {
    console.log(
      [
        "stat",
        "models",
        "chat",
        "     ms",
        "group",
        "model",
        "host",
        "key",
        "detail",
      ].join("  "),
    );
    console.log("-".repeat(140));
  } else {
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
  }
  for (const row of rows) printRow(row, method);
}

async function main(): Promise<void> {
  const source = parseLlmProbeConfigSource(readArg("--source"));
  const method = parseLlmProbeMethod(readArg("--method"));
  const timeoutMs = Number(readArg("--timeout") ?? process.env.LLM_PROBE_TIMEOUT_MS ?? "12000");
  const chatTimeoutMs = Number(
    readArg("--chat-timeout") ?? process.env.LLM_PROBE_CHAT_TIMEOUT_MS ?? "90000",
  );
  const json = hasFlag("--json");

  const report = await runLlmEndpointProbeReport({
    source,
    method,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 12_000,
    chatTimeoutMs: Number.isFinite(chatTimeoutMs) ? chatTimeoutMs : 90_000,
    includeAutoModels: !hasFlag("--no-auto"),
    listTargets: listLlmProbeTargetsFromFiles,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const methodHint = method === "full"
      ? "models + chat"
      : method;
    console.log(
      `Probing source=${source} method=${methodHint} `
      + `timeout=${report.timeoutMs}ms `
      + (method === "full" ? `chat-timeout=${chatTimeoutMs}ms ` : "")
      + `(${report.summary.total} endpoint(s))…\n`,
    );
    printTable(report.rows, method);
    if (report.autoModels?.length) {
      console.log("\nAuto model candidates (chat):");
      printTable(report.autoModels, "chat");
    }
    console.log("\nSummary by group:");
    for (const [label, stats] of Object.entries(report.summary.byGroup)) {
      const reachable = stats.reachable ? "reachable" : "unreachable";
      console.log(`  ${label}: ${stats.ok}/${stats.ok + stats.fail} OK (${reachable})`);
    }
    if (method === "full") {
      const chatFails = report.rows.filter((row) => row.models?.ok && !row.chat?.ok);
      if (chatFails.length) {
        console.log(
          "\nNote: endpoints with models OK but chat FAIL cannot serve conversations "
          + "(e.g. upstream 502).",
        );
      }
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
