#!/usr/bin/env node
/**
 * Discover hand-authored step-module refs from disk (single source of truth).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const AUTHORED_DIR = path.join(
  ROOT,
  "docs/authoring-references/step-modules/authored",
);
export const KEYWORDS_PATH = path.join(
  ROOT,
  "QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json",
);

/** @param {string} key */
export function buildRefId(key) {
  return key.replace(/^sys:/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/** @param {Record<string, unknown>} keywords */
export async function discoverAuthoredModuleKeys(keywords) {
  /** @type {Set<string>} */
  const keys = new Set();
  let files;
  try {
    files = await fs.readdir(AUTHORED_DIR);
  } catch {
    return keys;
  }

  const byRefId = new Map(
    Object.keys(keywords).map((key) => [buildRefId(key), key]),
  );

  for (const fname of files) {
    if (!fname.endsWith(".md")) continue;
    if (fname.toLowerCase() === "spec.md") continue;
    const refId = fname.slice(0, -3);
    const matched = byRefId.get(refId);
    if (matched) {
      keys.add(matched);
      continue;
    }
    const fallback = `sys:${refId}`;
    if (keywords[fallback]) {
      keys.add(fallback);
    } else {
      console.warn(
        `authored/${fname}: no matching key in step-runner-agent-keywords.json (refId=${refId})`,
      );
    }
  }

  return keys;
}

/** @param {Record<string, unknown>} [keywords] */
export async function loadAuthoredModuleKeys(keywords) {
  const catalog =
    keywords ?? JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  return discoverAuthoredModuleKeys(catalog);
}
