/**
 * Run docs search tests and print a human-readable report.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  searchAuthoringDocRows,
} from "@/lib/action-authoring-docs-search";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REPORT_QUERIES = [
  "expressions",
  "workspace patch",
  "sys:http",
  "webview2",
  "子程序",
  "step runner",
  "workspac",
];

function runAutomatedTests(): number {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "--test",
      "--test-reporter",
      "spec",
      "lib/action-authoring-docs-search.test.ts",
      "lib/action-authoring-docs-search.integration.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

async function printSearchReport(): Promise<void> {
  const rows = await loadAuthoringDocFixtureRows();
  const index = buildAuthoringDocsSearchIndex(rows);

  console.log(`\n${"=".repeat(72)}`);
  console.log("Docs search report (top 3 per query)");
  console.log(`Corpus: ${rows.length} documents`);
  console.log("=".repeat(72));

  for (const query of REPORT_QUERIES) {
    const hits = searchAuthoringDocRows(index, query, 3);
    console.log(`\nQuery: ${query}`);
    console.log(`Matches: ${hits.length}`);
    if (hits.length === 0) {
      console.log("  (no results)");
      continue;
    }
    for (let i = 0; i < hits.length; i++) {
      const { row, score } = hits[i];
      const ref = row.reference ? `/${row.reference}` : "";
      console.log(
        `  ${i + 1}. [${score.toFixed(2)}] ${row.topic}${ref} — ${row.title}`,
      );
    }
  }
  console.log(`\n${"=".repeat(72)}`);
}

async function main(): Promise<void> {
  const exitCode = runAutomatedTests();
  await printSearchReport();
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
