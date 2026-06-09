#!/usr/bin/env node
/**
 * Scaffold a new hand-authored step-module reference for Agent docs.
 *
 * Usage:
 *   node scripts/scaffold-step-module-ref.mjs sys:myModule
 *   node scripts/scaffold-step-module-ref.mjs sys:myModule --keywords "foo,bar,中文"
 *   node scripts/scaffold-step-module-ref.mjs sys:myModule --dry-run
 *
 * After editing authored/<id>.md:
 *   npm run docs:modules:analyze
 *   npm run docs:gen --prefix agent-gui -- --force
 */
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_DIR,
  KEYWORDS_PATH,
  buildRefId,
} from "./step-module-authored-discovery.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALIASES_PATH = path.join(
  ROOT,
  "docs/action-authoring-src/manifest/reference-search-aliases.json",
);
const DOC_BASE = "https://getquicker.net/KC/Help/Doc";

function parseArgs(argv) {
  /** @type {{ key?: string, keywords: string[], dryRun: boolean, skipGen: boolean }} */
  const out = { keywords: [], dryRun: false, skipGen: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--skip-gen") {
      out.skipGen = true;
      continue;
    }
    if (arg === "--keywords" && argv[i + 1]) {
      out.keywords.push(
        ...argv[++i]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }
    if (arg.startsWith("--keywords=")) {
      out.keywords.push(
        ...arg
          .slice("--keywords=".length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }
    if (!arg.startsWith("-") && !out.key) {
      out.key = arg.trim();
    }
  }
  return out;
}

/** @param {string} slug */
function kcUrl(slug) {
  return `${DOC_BASE}/${slug}`;
}

/** @param {string} key @param {string} slug @param {string} [snippet] */
function renderStub(key, slug, snippet) {
  const purpose = snippet?.trim() || "TODO: one-line purpose for agents";
  return `# ${key}

> **分类**：TODO · **来源**：仓库手写 · **官方**：[${slug}](${kcUrl(slug)})

**用途**：${purpose}

**何时读**：\`get\` 已够则不必读；写步骤前若有 wire 陷阱再读「wire 要点」。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| TODO | inline / \`.var\` / \`.file\` | non-obvious only |

## 示例

\`\`\`json
{
  "stepRunnerKey": "${key}",
  "inputParams": {},
  "outputParams": {}
}
\`\`\`

## 相关

step-runner-get · implementation-fallback
`;
}

/** @param {Record<string, unknown>} keywords @param {string} key @param {string[]} extraKeywords */
async function ensureKeywordEntry(keywords, key, extraKeywords) {
  if (keywords[key]) return false;
  const refId = buildRefId(key);
  const snippet = `TODO: ${refId} module`;
  keywords[key] = {
    keywords: [refId, key.replace(/^sys:/, ""), ...extraKeywords],
    snippet,
  };
  return true;
}

/** @param {string} refId @param {string[]} aliases */
async function ensureSearchAliases(refId, aliases) {
  if (aliases.length === 0) return false;
  let data = { "step-modules": {} };
  try {
    data = JSON.parse(await fs.readFile(ALIASES_PATH, "utf8"));
  } catch {
    // new file
  }
  if (!data["step-modules"]) data["step-modules"] = {};
  if (data["step-modules"][refId]?.length) return false;
  data["step-modules"][refId] = aliases;
  await fs.writeFile(ALIASES_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return true;
}

function run(cmd, args, cwd = ROOT) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${result.status})`);
  }
}

async function main() {
  const { key, keywords: extraKeywords, dryRun, skipGen } = parseArgs(
    process.argv.slice(2),
  );
  if (!key?.startsWith("sys:")) {
    console.error("Usage: node scripts/scaffold-step-module-ref.mjs sys:<id> [--keywords a,b]");
    process.exit(1);
  }

  const refId = buildRefId(key);
  const slug = refId.toLowerCase();
  const outPath = path.join(AUTHORED_DIR, `${refId}.md`);

  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  const addedKeyword = await ensureKeywordEntry(keywords, key, extraKeywords);
  const snippet =
    /** @type {{ snippet?: string }} */ (keywords[key])?.snippet ?? "";

  try {
    await fs.access(outPath);
    console.log(`Already exists: ${path.relative(ROOT, outPath)}`);
  } catch {
    const body = renderStub(key, slug, snippet);
    if (dryRun) {
      console.log(`Would create ${path.relative(ROOT, outPath)}`);
    } else {
      await fs.mkdir(AUTHORED_DIR, { recursive: true });
      await fs.writeFile(outPath, body, "utf8");
      console.log(`Created ${path.relative(ROOT, outPath)}`);
    }
  }

  if (addedKeyword) {
    if (dryRun) {
      console.log(`Would add keywords entry for ${key}`);
    } else {
      await fs.writeFile(
        KEYWORDS_PATH,
        `${JSON.stringify(keywords, null, 2)}\n`,
        "utf8",
      );
      console.log(`Added ${key} to step-runner-agent-keywords.json`);
    }
  }

  if (extraKeywords.length > 0) {
    if (dryRun) {
      console.log(`Would add search aliases for ${refId}: ${extraKeywords.join(", ")}`);
    } else {
      const added = await ensureSearchAliases(refId, extraKeywords);
      if (added) {
        console.log(`Added search aliases for step-modules/${refId}`);
      }
    }
  }

  if (dryRun || skipGen) {
    console.log("\nNext: edit authored file, then:");
    console.log("  npm run docs:modules:analyze");
    console.log("  npm run docs:modules:gen -- --force");
    console.log("  npm run docs:gen --prefix agent-gui -- --force");
    return;
  }

  run("npm", ["run", "docs:modules:analyze"]);
  run("node", ["scripts/generate-step-module-refs.mjs", "--force"]);
  run("npm", ["run", "docs:gen", "--prefix", "agent-gui", "--", "--force"]);

  console.log("\nDone. Agent paths:");
  console.log(`  step-runner search → step-runner get --key ${key}`);
  console.log(`  docs get topic=step-modules reference=${refId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
