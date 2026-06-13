#!/usr/bin/env node
/**
 * Promote draft skills listed in learned-skills/registry.json into
 * docs/action-authoring-src/skills/<name>/ for docs:gen.
 *
 * Usage: node scripts/promote-learned-skills-from-registry.mjs [--dry-run]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(
  ROOT,
  "docs/authoring-references/learned-skills/registry.json",
);
const OUT_ROOT = path.join(ROOT, "docs/action-authoring-src/skills");

/** @param {string} raw */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  return { meta, body: match[2] };
}

/** @param {string} body */
function normalizePromotedBody(body) {
  return body
    .replace(/\*\*状态\*\*：(?:draft|review)/g, "**状态**：promoted")
    .replace(/（review）/g, "")
    .replace(/\(review\)/gi, "")
    .trimEnd();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const registryRaw = await fs.readFile(REGISTRY, "utf8");
  const registry = JSON.parse(registryRaw);
  const promotedAt = new Date().toISOString().slice(0, 10);

  /** @type {string[]} */
  const promoted = [];

  for (const entry of registry.skills) {
    if (entry.status !== "review" && entry.status !== "draft") continue;

    const skillPath = path.join(ROOT, entry.skillPath);
    const raw = await fs.readFile(skillPath, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name || entry.skillName;
    const description = meta.description;
    if (!name || !description) {
      throw new Error(`Missing name/description in ${entry.skillPath}`);
    }

    const manifest = {
      name,
      description,
      "allowed-tools": "docs",
      compatibility:
        "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin",
    };
    const skillSrc = `${normalizePromotedBody(body)}\n`;
    const outDir = path.join(OUT_ROOT, name);

    if (!dryRun) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(
        path.join(outDir, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );
      await fs.writeFile(path.join(outDir, "SKILL.src.md"), skillSrc, "utf8");
    }

    entry.status = "promoted";
    entry.promotedAt = promotedAt;
    entry.reviewedBy = "agent";
    promoted.push(name);
  }

  registry.updatedAt = new Date().toISOString();

  if (!dryRun) {
    await fs.writeFile(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }

  console.log(
    dryRun
      ? `[dry-run] Would promote ${promoted.length} skill(s):`
      : `Promoted ${promoted.length} skill(s):`,
  );
  for (const name of promoted) {
    console.log(`  - ${name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
