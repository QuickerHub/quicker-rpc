#!/usr/bin/env node
/**
 * DEV PROBE — getquicker.net /Search HTML parser.
 * Target: move into qkrpc as `action library search` (see docs/authoring-references/getquicker-library-search/DESIGN.md).
 * Agents must NOT call this directly in production; use qkrpc API when available.
 */
import { writeFileSync } from "node:fs";

const BASE = "https://getquicker.net/Search";
const VALID_TYPES = new Set([
  "",
  "SharedAction",
  "SharedSubProgram",
  "DevDoc",
  "Document",
  "Article",
  "VersionHistoryDoc",
  "QaQuestion",
]);

function parseArgs(argv) {
  const out = {
    keyword: "",
    type: "SharedAction",
    page: 1,
    days: "",
    limit: 20,
    json: false,
    help: false,
    dumpHtml: "",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json") out.json = true;
    else if (a === "--keyword" || a === "-q") out.keyword = argv[++i] ?? "";
    else if (a === "--type" || a === "-t") out.type = argv[++i] ?? "";
    else if (a === "--page" || a === "-p") out.page = Number(argv[++i] ?? 1);
    else if (a === "--days" || a === "--ud") out.days = argv[++i] ?? "";
    else if (a === "--limit" || a === "-l") out.limit = Number(argv[++i] ?? 20);
    else if (a === "--dump-html") out.dumpHtml = argv[++i] ?? "";
    else throw new Error(`Unknown arg: ${a}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/search-getquicker-library.mjs --keyword <text> [options]

Options:
  --type, -t     SharedAction | SharedSubProgram | DevDoc | Document | ... (default: SharedAction)
  --page, -p     Page number, 1-based (default: 1)
  --days, --ud   Time filter days: 7 | 30 | 90 | 365 (default: all)
  --limit, -l    Max items returned (default: 20)
  --json         JSON stdout
  --dump-html    Write raw HTML to path (debug)
  --help, -h     This help

Spec: docs/authoring-references/getquicker-library-search/SPEC.md`);
}

function buildSearchUrl({ keyword, type, page, days }) {
  const u = new URL(BASE);
  u.searchParams.set("keyword", keyword);
  if (type) u.searchParams.set("t", type);
  u.searchParams.set("p", String(page));
  if (days) u.searchParams.set("ud", String(days));
  return u.toString();
}

function stripTags(html) {
  return html
    .replace(/<em>/gi, "")
    .replace(/<\/em>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRedirect(href) {
  try {
    const u = new URL(href, "https://getquicker.net");
    const type = u.searchParams.get("type") ?? "";
    const id = u.searchParams.get("id") ?? "";
    return { type, id, searchRedirectUrl: u.toString() };
  } catch {
    return { type: "", id: "", searchRedirectUrl: href };
  }
}

function sharedActionUrl(id) {
  if (!id) return null;
  return `https://getquicker.net/Sharedaction?code=${id}`;
}

/** @param {string} html */
function parseSearchHtml(html, limit) {
  const totalMatch = html.match(/共找到\s*(\d+)\s*个结果/);
  const totalCount = totalMatch ? Number(totalMatch[1]) : null;

  const items = [];
  const blocks = html.split('<div class="result-item d-flex ">');
  for (let i = 1; i < blocks.length && items.length < limit; i++) {
    const block = blocks[i];
    const end = block.indexOf("</div>\n                            <div class=\"result-item");
    const chunk = end > 0 ? block.slice(0, end) : block.slice(0, 4000);

    const typeLabelMatch = chunk.match(
      /<div class="font12">\s*([^<]+?)\s*<\/div>/,
    );
    const typeLabel = typeLabelMatch ? typeLabelMatch[1].trim() : "";

    const linkMatch = chunk.match(
      /<a[^>]*class="object-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!linkMatch) continue;

    const href = linkMatch[1].replace(/&amp;/g, "&");
    const title = stripTags(linkMatch[2]);
    const { type, id, searchRedirectUrl } = parseRedirect(href);

    const authorMatch = chunk.match(
      /<a class="user-link[^"]*"[^>]*>([^<]+)<\/a>/,
    );
    const author = authorMatch ? authorMatch[1].trim() : null;

    const dateMatch = chunk.match(
      /far fa-history[\s\S]*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/,
    );
    const updatedAt = dateMatch ? dateMatch[1].trim() : null;

    const likesMatch = chunk.match(/title="点赞"[\s\S]*?>(\d+)</);
    const likes = likesMatch ? Number(likesMatch[1]) : null;

    const snippetMatch = chunk.match(
      /<div class="font14 text-black-50"[^>]*>([\s\S]*?)<\/div>/,
    );
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";

    const apps = [...chunk.matchAll(/badge badge-info[^>]*>([^<]+)</g)].map(
      (m) => m[1].trim(),
    );

    items.push({
      typeLabel,
      type,
      id,
      title,
      snippet,
      author,
      updatedAt,
      likes,
      apps,
      searchRedirectUrl,
      sharedActionUrl: type === "SharedAction" ? sharedActionUrl(id) : null,
      detailUrl:
        type === "SharedAction"
          ? sharedActionUrl(id)
          : searchRedirectUrl,
    });
  }

  return { totalCount, items };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.keyword.trim()) {
    console.error("error: --keyword is required");
    printHelp();
    process.exit(1);
  }
  if (!VALID_TYPES.has(args.type)) {
    console.error(`error: invalid --type ${args.type}`);
    process.exit(1);
  }

  const url = buildSearchUrl(args);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "quicker-rpc-learning/1.0 (+https://github.com/QuickerHub/quicker-rpc)",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    console.error(`error: HTTP ${res.status} for ${url}`);
    process.exit(1);
  }
  const html = await res.text();
  if (args.dumpHtml) {
    writeFileSync(args.dumpHtml, html, "utf8");
  }

  const { totalCount, items } = parseSearchHtml(html, args.limit);
  const payload = {
    ok: true,
    keyword: args.keyword,
    type: args.type || null,
    page: args.page,
    days: args.days || null,
    searchUrl: url,
    totalCount,
    matchCount: items.length,
    items,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(
      `# getquicker search: ${args.keyword} (type=${args.type || "all"}) p=${args.page}`,
    );
    console.log(`url: ${url}`);
    console.log(`total: ${totalCount ?? "?"}  returned: ${items.length}\n`);
    for (const it of items) {
      const link = it.sharedActionUrl ?? it.searchRedirectUrl;
      console.log(`- [${it.typeLabel}] ${it.title}`);
      if (it.author) console.log(`  author: ${it.author}`);
      if (it.updatedAt) console.log(`  updated: ${it.updatedAt}`);
      if (it.apps.length) console.log(`  apps: ${it.apps.join(", ")}`);
      if (it.snippet) console.log(`  snippet: ${it.snippet.slice(0, 120)}`);
      console.log(`  url: ${link}`);
      if (it.id && it.type === "SharedAction") console.log(`  sharedActionId: ${it.id}`);
      console.log();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
