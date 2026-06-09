/**
 * Authoring docs search relevance evaluation CLI.
 *
 * Usage:
 *   pnpm test:docs-search:eval
 *   pnpm test:docs-search:eval -- --verbose
 *   pnpm test:docs-search:eval -- --json
 *   pnpm test:docs-search:eval -- --category chinese
 *   pnpm test:docs-search:eval -- --probe "表达式"
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  searchAuthoringDocRows,
} from "@/lib/action-authoring-docs-search";
import {
  assertDocsSearchEvalThresholds,
  DEFAULT_EVAL_DATASET,
  formatDocsSearchEvalReport,
  probeDocsSearch,
  runDocsSearchEval,
} from "@/lib/action-authoring-docs-search-eval";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type CliOptions = {
  verbose: boolean;
  json: boolean;
  jsonOut?: string;
  categories: string[];
  probe?: string;
  probeLimit: number;
  strict: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    verbose: false,
    json: false,
    categories: [],
    probeLimit: 10,
    strict: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      continue;
    }
    if (arg === "--category" && argv[i + 1]) {
      options.categories.push(argv[++i]);
      continue;
    }
    if (arg.startsWith("--category=")) {
      options.categories.push(arg.slice("--category=".length));
      continue;
    }
    if (arg === "--probe" && argv[i + 1]) {
      options.probe = argv[++i];
      continue;
    }
    if (arg.startsWith("--probe=")) {
      options.probe = arg.slice("--probe=".length);
      continue;
    }
    if (arg === "--probe-limit" && argv[i + 1]) {
      options.probeLimit = Number.parseInt(argv[++i], 10) || options.probeLimit;
      continue;
    }
    if (arg === "--json-out" && argv[i + 1]) {
      options.jsonOut = argv[++i];
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm test:docs-search:eval [--verbose] [--json] [--strict]
  pnpm test:docs-search:eval -- --category chinese --category fuzzy
  pnpm test:docs-search:eval -- --probe "workspace patch" [--probe-limit 15]
  pnpm test:docs-search:eval -- --json-out .local/docs-search-eval.json

Runs golden-query eval from lib/action-authoring-docs-search-eval.json.
Metrics: Top@1, MRR, Recall@K; cases with knownIssue do not block CI unless --strict.
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rows = await loadAuthoringDocFixtureRows();
  const index = buildAuthoringDocsSearchIndex(rows);
  const search = (query: string, limit: number) =>
    searchAuthoringDocRows(index, query, limit);

  if (options.probe) {
    console.log(probeDocsSearch(search, options.probe, options.probeLimit));
    process.exit(0);
  }

  const summary = runDocsSearchEval(search, {
    corpusSize: rows.length,
    categories: options.categories.length > 0 ? options.categories : undefined,
  });

  if (options.json) {
    const payload = JSON.stringify(summary, null, 2);
    if (options.jsonOut) {
      writeFileSync(options.jsonOut, payload, "utf8");
      console.log(`Wrote ${options.jsonOut}`);
    } else {
      console.log(payload);
    }
  } else {
    console.log(
      formatDocsSearchEvalReport(summary, {
        verbose: options.verbose,
        failuresOnly: !options.verbose,
      }),
    );
  }

  const thresholdErrors = assertDocsSearchEvalThresholds(summary);
  const knownIssueOnly =
    summary.blockingFailed === 0 && summary.knownIssueFailed > 0;

  if (thresholdErrors.length > 0 && (options.strict || !knownIssueOnly)) {
    if (!options.json) {
      console.error("");
      console.error("Threshold violations:");
      for (const err of thresholdErrors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }

  if (summary.blockingFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
