/**
 * CLI demo for authoring docs MiniSearch (offline — reads repo markdown directly).
 * Usage:
 *   pnpm docs:search -- expressions
 *   pnpm docs:search -- "workspace patch" --limit 5
 *   pnpm docs:search -- --samples
 */
import { loadAuthoringDocFixtureRows } from "../lib/action-authoring-docs-fixtures";
import {
  buildAuthoringDocsSearchIndex,
  buildSearchExcerpt,
  searchAuthoringDocRows,
  splitSearchPatterns,
  type AuthoringDocSearchRow,
} from "../lib/action-authoring-docs-search";

const SAMPLE_QUERIES = [
  "expressions",
  "workspace patch",
  "sys:http",
  "webview2",
  "子程序",
  "表达式",
  "step runner",
  "workspac",
];

function parseArgs(argv: string[]): { queries: string[]; limit: number } {
  const queries: string[] = [];
  let limit = 5;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--samples") {
      queries.push(...SAMPLE_QUERIES);
      continue;
    }
    if (arg === "--limit" && argv[i + 1]) {
      limit = Number.parseInt(argv[++i], 10) || limit;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10) || limit;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      queries.push(arg);
    }
  }

  return { queries, limit };
}

function printHelp(): void {
  console.log(`Usage:
  pnpm docs:search -- <query> [--limit N]
  pnpm docs:search -- --samples [--limit N]

Reads docs from: docs/skills/quicker-authoring (offline, no dev server).

Examples:
  pnpm docs:search -- expressions
  pnpm docs:search -- "workspace editing" --limit 3
  pnpm docs:search -- --samples
`);
}

let cachedIndex: ReturnType<typeof buildAuthoringDocsSearchIndex> | null = null;

async function getSearchIndex() {
  if (!cachedIndex) {
    const rows = await loadAuthoringDocFixtureRows();
    cachedIndex = buildAuthoringDocsSearchIndex(rows);
  }
  return cachedIndex;
}

function formatHit(
  index: number,
  row: AuthoringDocSearchRow,
  score: number | undefined,
  patterns: string[],
  sectionHeading?: string,
): string {
  const title = row.reference
    ? `${row.title} (${row.topic}/${row.reference})`
    : row.title;
  const ref = row.reference ? `  ref: ${row.reference}` : "";
  const sectionLine = sectionHeading ? `  section: ${sectionHeading}` : "";
  const scoreLine =
    score != null && Number.isFinite(score)
      ? `  score: ${score.toFixed(2)}`
      : "";
  return [
    `${index}. ${title}`,
    `  topic: ${row.topic}${ref}`,
    sectionLine,
    scoreLine,
    `  desc: ${row.description}`,
    `  excerpt: ${buildSearchExcerpt(row.markdown, patterns, 420, sectionHeading)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runQuery(query: string, limit: number): Promise<void> {
  const patterns = splitSearchPatterns(query);
  const bundle = await getSearchIndex();
  const hits = searchAuthoringDocRows(bundle, query, limit);

  console.log("─".repeat(72));
  console.log(`Query: ${query.trim() || "(empty)"}`);
  console.log(`Matches: ${hits.length}`);
  console.log("");

  if (hits.length === 0) {
    console.log("(no results)");
    return;
  }

  for (let i = 0; i < hits.length; i++) {
    const { row, score, sectionHeading } = hits[i];
    console.log(
      formatHit(
        i + 1,
        row,
        patterns.length > 0 ? score : undefined,
        patterns,
        sectionHeading,
      ),
    );
    console.log("");
  }
}

async function main(): Promise<void> {
  const { queries, limit } = parseArgs(process.argv.slice(2));
  if (queries.length === 0) {
    printHelp();
    process.exit(1);
  }

  for (const query of queries) {
    await runQuery(query, limit);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
