/**
 * Run docs search unit tests + relevance eval report.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  searchAuthoringDocRows,
} from "@/lib/action-authoring-docs-search";
import {
  assertDocsSearchEvalThresholds,
  formatDocsSearchEvalReport,
  runDocsSearchEval,
} from "@/lib/action-authoring-docs-search-eval";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
      "lib/action-authoring-docs-search-eval.test.ts",
      "lib/action-authoring-docs-reference.test.ts",
    ],
    { cwd: ROOT, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

async function printEvalReport(): Promise<number> {
  const rows = await loadAuthoringDocFixtureRows();
  const index = buildAuthoringDocsSearchIndex(rows);
  const summary = runDocsSearchEval(
    (query, limit) => searchAuthoringDocRows(index, query, limit),
    { corpusSize: rows.length },
  );

  console.log(formatDocsSearchEvalReport(summary, { failuresOnly: true }));

  const thresholdErrors = assertDocsSearchEvalThresholds(summary);
  if (thresholdErrors.length > 0 && summary.blockingFailed > 0) {
    console.error("\nThreshold violations:");
    for (const err of thresholdErrors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const testExit = runAutomatedTests();
  const reportExit = await printEvalReport();
  process.exit(testExit !== 0 ? testExit : reportExit);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
