#!/usr/bin/env node
/**
 * Finalize learned skills in registry: validate action-authoring-src paths,
 * optionally mark draft/review → promoted. No file copy (single source: src).
 *
 * Usage:
 *   node scripts/promote-learned-skills-from-registry.mjs [--dry-run] [--promote]
 *
 * --promote  Only entries with status draft|review are marked promoted.
 *            Without --promote, only validates src files exist.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(
  ROOT,
  "docs/authoring-references/learned-skills/registry.json",
);
const SRC_ROOT = path.join(ROOT, "docs/action-authoring-src/skills");

/** @param {Record<string, unknown>} entry */
function resolveSrcPaths(entry) {
  const skillSrcPath = String(
    entry.skillSrcPath ??
      `docs/action-authoring-src/skills/${entry.skillName}/SKILL.src.md`,
  );
  const manifestPath = String(
    entry.manifestPath ??
      `docs/action-authoring-src/skills/${entry.skillName}/manifest.json`,
  );
  return {
    skillAbs: path.join(ROOT, skillSrcPath),
    manifestAbs: path.join(ROOT, manifestPath),
    skillSrcPath,
    manifestPath,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doPromote = process.argv.includes("--promote");
  const registryRaw = await fs.readFile(REGISTRY, "utf8");
  const registry = JSON.parse(registryRaw);
  const promotedAt = new Date().toISOString().slice(0, 10);

  /** @type {string[]} */
  const ok = [];
  /** @type {string[]} */
  const promoted = [];

  for (const entry of registry.skills) {
    const { skillAbs, manifestAbs, skillSrcPath, manifestPath } =
      resolveSrcPaths(entry);
    entry.skillSrcPath = skillSrcPath;
    entry.manifestPath = manifestPath;

    try {
      await fs.access(skillAbs);
      await fs.access(manifestAbs);
    } catch {
      throw new Error(
        `Missing src for ${entry.skillName}: ${skillSrcPath} or ${manifestPath}`,
      );
    }

    const manifest = JSON.parse(await fs.readFile(manifestAbs, "utf8"));
    if (manifest.name !== entry.skillName) {
      throw new Error(
        `manifest.name ${manifest.name} !== registry skillName ${entry.skillName}`,
      );
    }

    ok.push(entry.skillName);

    if (
      doPromote &&
      (entry.status === "draft" || entry.status === "review")
    ) {
      if (!dryRun) {
        entry.status = "promoted";
        entry.promotedAt = promotedAt;
        entry.reviewedBy = entry.reviewedBy ?? "maintainer";
      }
      promoted.push(entry.skillName);
    }
  }

  registry.updatedAt = new Date().toISOString();

  if (!dryRun) {
    await fs.writeFile(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }

  console.log(
    dryRun ? `[dry-run] Validated ${ok.length} skill(s) under ${SRC_ROOT}` : `Validated ${ok.length} skill(s).`,
  );
  if (doPromote) {
    console.log(
      dryRun
        ? `[dry-run] Would promote ${promoted.length} skill(s):`
        : `Promoted ${promoted.length} skill(s):`,
    );
    for (const name of promoted) {
      console.log(`  - ${name}`);
    }
    if (!dryRun && promoted.length > 0) {
      console.log("Run: npm run docs:gen");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
