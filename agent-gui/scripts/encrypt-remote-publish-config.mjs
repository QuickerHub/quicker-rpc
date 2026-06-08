#!/usr/bin/env node
/**
 * Encrypt llm-publish.config.json for Bitiful OSS upload.
 * Usage: node encrypt-remote-publish-config.mjs <plain.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { encodeRemotePublishPayload } from "./llm-secret-cipher.mjs";

function usage() {
  console.error("Usage: node encrypt-remote-publish-config.mjs <plain.json> <out.json>");
  process.exit(1);
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  usage();
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(inputPath, "utf8"));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`Invalid publish config JSON: ${message}`);
  process.exit(1);
}

if (!Array.isArray(parsed?.endpoints) || parsed.endpoints.length === 0) {
  console.error("Publish config must contain a non-empty endpoints array.");
  process.exit(1);
}

const wrapped = {
  version: 1,
  enc: encodeRemotePublishPayload(JSON.stringify(parsed)),
};

writeFileSync(outputPath, `${JSON.stringify(wrapped)}\n`, "utf8");
