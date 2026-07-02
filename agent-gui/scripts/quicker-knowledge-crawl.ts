import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { normalizeQuickerKnowledgeHtml } from "@/lib/quicker-knowledge/normalize";
import {
  canonicalizeQuickerKnowledgeUrl,
  isAllowedQuickerKnowledgeUrl,
} from "@/lib/quicker-knowledge/url-policy";
import type { QuickerKnowledgeChunk } from "@/lib/quicker-knowledge/types";

const DEFAULT_OUT = "data/quicker-knowledge/chunks.jsonl";
const DEFAULT_MAX_PAGES = 80;
const MAX_PAGES_LIMIT = 1_000;
const USER_AGENT = "QuickerAgentKnowledgeCrawler/0.1 (+https://getquicker.net)";
const SEEDS = [
  "https://getquicker.net/KC",
  "https://getquicker.net/KC/Manual",
  "https://getquicker.net/Docs",
] as const;

type ParsedArgs = {
  out: string;
  maxPages: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  let out = DEFAULT_OUT;
  let maxPages = DEFAULT_MAX_PAGES;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--out" && argv[i + 1]) {
      out = argv[++i]!;
      continue;
    }
    if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--max-pages" && argv[i + 1]) {
      maxPages = parseMaxPages(argv[++i]!, maxPages);
      continue;
    }
    if (arg.startsWith("--max-pages=")) {
      maxPages = parseMaxPages(arg.slice("--max-pages=".length), maxPages);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { out, maxPages };
}

function parseMaxPages(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, MAX_PAGES_LIMIT);
}

function printUsage(): void {
  console.log(`Usage:
  pnpm knowledge:crawl -- [--out data/quicker-knowledge/chunks.jsonl] [--max-pages 80]

Examples:
  pnpm knowledge:crawl -- --max-pages 5
  pnpm exec tsx scripts/quicker-knowledge-crawl.ts -- --out /tmp/chunks.jsonl
`);
}

function extractKnowledgeLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const canonicalUrl = canonicalizeQuickerKnowledgeUrl(href, baseUrl);
    if (!canonicalUrl || !isAllowedQuickerKnowledgeUrl(canonicalUrl)) {
      continue;
    }
    if (seen.has(canonicalUrl)) {
      continue;
    }

    seen.add(canonicalUrl);
    links.push(canonicalUrl);
  }

  return links;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function crawl(maxPages: number): Promise<QuickerKnowledgeChunk[]> {
  const queue = SEEDS.map((seed) => canonicalizeQuickerKnowledgeUrl(seed)).filter(
    (url): url is string => Boolean(url) && isAllowedQuickerKnowledgeUrl(url),
  );
  const queued = new Set(queue);
  const seen = new Set<string>();
  const chunks: QuickerKnowledgeChunk[] = [];

  while (queue.length > 0 && seen.size < maxPages) {
    const url = queue.shift()!;
    queued.delete(url);
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    console.log(`[${seen.size}/${maxPages}] fetch ${url}`);

    try {
      const fetchedAt = new Date().toISOString();
      const html = await fetchHtml(url);
      const normalized = normalizeQuickerKnowledgeHtml({ html, url, fetchedAt });
      chunks.push(...normalized.chunks);

      for (const link of extractKnowledgeLinks(html, normalized.page.canonicalUrl)) {
        if (seen.has(link) || queued.has(link) || seen.size + queue.length >= maxPages) {
          continue;
        }

        queued.add(link);
        queue.push(link);
      }
    } catch (error) {
      console.warn(`warn: failed to crawl ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return chunks;
}

async function writeJsonl(out: string, chunks: QuickerKnowledgeChunk[]): Promise<void> {
  await mkdir(dirname(out), { recursive: true });
  const content = chunks.map((chunk) => JSON.stringify(chunk)).join("\n");
  await writeFile(out, `${content}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const chunks = await crawl(args.maxPages);
  await writeJsonl(args.out, chunks);
  console.log(`Wrote ${chunks.length} chunks to ${args.out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
