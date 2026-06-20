/**
 * Analyze QuickerAgent chat export JSON for prompt/tool/skill optimization.
 *
 *   pnpm agent-session -- path/to/quicker-agent-*.json
 *   pnpm agent-session -- --latest
 *   pnpm agent-session -- export.json --json
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  analyzeChatThreadExportText,
  formatSessionAnalysisJson,
  formatSessionAnalysisReport,
} from "@/lib/agent-session-analysis";

const EXPORT_FILE_PREFIX = "quicker-agent-";
const EXPORT_FILE_SUFFIX = ".json";

function defaultExportsDirectory(): string {
  const appData = process.env.APPDATA?.trim();
  if (appData) {
    return join(appData, "QuickerAgent", "exports");
  }
  return join(homedir(), "AppData", "Roaming", "QuickerAgent", "exports");
}

async function resolveLatestExportPath(exportsDir?: string): Promise<string> {
  const dir = resolve(exportsDir?.trim() || defaultExportsDirectory());
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(`Exports directory not found: ${dir}`);
  }

  const candidates = entries.filter(
    (name) =>
      name.startsWith(EXPORT_FILE_PREFIX) && name.endsWith(EXPORT_FILE_SUFFIX),
  );
  if (candidates.length === 0) {
    throw new Error(`No ${EXPORT_FILE_PREFIX}*.json in ${dir}`);
  }

  let latestPath = "";
  let latestMtime = 0;
  for (const name of candidates) {
    const fullPath = join(dir, name);
    const fileStat = await stat(fullPath);
    const mtime = fileStat.mtimeMs;
    if (mtime >= latestMtime) {
      latestMtime = mtime;
      latestPath = fullPath;
    }
  }
  return latestPath;
}

function parseArgs(argv: string[]): {
  exportPath?: string;
  json: boolean;
  latest: boolean;
  exportsDir?: string;
} {
  const json = argv.includes("--json");
  const latest = argv.includes("--latest");
  const exportsDirFlag = argv.find((arg) => arg.startsWith("--exports-dir="));
  const exportsDir = exportsDirFlag?.slice("--exports-dir=".length);
  const positional = argv.filter(
    (arg) => !arg.startsWith("-") && !arg.startsWith("--exports-dir="),
  );
  const exportPath = positional[0];

  if (latest && exportPath) {
    throw new Error("Use either --latest or a file path, not both.");
  }
  if (!latest && !exportPath) {
    throw new Error(
      "Usage: pnpm agent-session -- <export.json> [--json] | --latest [--exports-dir=PATH]",
    );
  }

  return { exportPath, json, latest, exportsDir };
}

async function main(): Promise<void> {
  const { exportPath, json, latest, exportsDir } = parseArgs(process.argv.slice(2));
  const resolvedPath = latest
    ? await resolveLatestExportPath(exportsDir)
    : resolve(exportPath!);

  if (latest) {
    console.error(`agent-session: latest export → ${resolvedPath}`);
  }

  const text = await readFile(resolvedPath, "utf8");
  const result = analyzeChatThreadExportText(text);

  if (json) {
    process.stdout.write(formatSessionAnalysisJson(result));
  } else {
    process.stdout.write(formatSessionAnalysisReport(result));
  }

  const failed =
    result.trace.traceRubric.violations.length > 0
    || result.trace.findings.some((finding) => finding.severity === "error");
  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent-session analyze failed: ${message}`);
  process.exitCode = 1;
});
