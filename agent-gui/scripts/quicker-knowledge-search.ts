import {
  buildQuickerKnowledgeKeywordIndex,
  searchQuickerKnowledge,
} from "@/lib/quicker-knowledge/search";
import { loadQuickerKnowledgeChunksFromJsonl } from "@/lib/quicker-knowledge/store.server";

type ParsedArgs = {
  query: string;
  limit: number;
  path?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const queryParts: string[] = [];
  let limit = 6;
  let path: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--limit" && argv[i + 1]) {
      limit = Number.parseInt(argv[++i]!, 10) || limit;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10) || limit;
      continue;
    }
    if (arg === "--path" && argv[i + 1]) {
      path = argv[++i]!;
      continue;
    }
    if (arg.startsWith("--path=")) {
      path = arg.slice("--path=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) {
      queryParts.push(arg);
    }
  }

  return {
    query: queryParts.join(" ").trim(),
    limit,
    path,
  };
}

function printUsage(): void {
  console.log(`Usage:
  pnpm knowledge:search -- <query> [--limit N] [--path chunks.jsonl]
  pnpm exec tsx scripts/quicker-knowledge-search.ts -- <query> [--limit N] [--path chunks.jsonl]

Examples:
  pnpm knowledge:search -- 动作面板
  pnpm knowledge:search -- "sys form" --limit 3
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.query.length === 0) {
    printUsage();
    process.exit(1);
  }

  const chunks = await loadQuickerKnowledgeChunksFromJsonl(args.path);
  const index = buildQuickerKnowledgeKeywordIndex(chunks);
  const hits = searchQuickerKnowledge(index, {
    query: args.query,
    limit: args.limit,
  });

  console.log(`Matches: ${hits.length}`);
  console.log("");

  if (hits.length === 0) {
    console.log("(no results)");
    return;
  }

  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i]!;
    const section = hit.sectionPath.length > 0 ? hit.sectionPath.join(" > ") : "(root)";
    console.log(`${i + 1}. ${hit.title}`);
    console.log(`   url: ${hit.url}`);
    console.log(`   section: ${section}`);
    console.log(`   snippet: ${hit.snippet}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
