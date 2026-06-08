#!/usr/bin/env node
/**
 * Embed LLM_REMOTE_PUBLISH_CIPHER_PEPPER into Tauri app resources at build time.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} outputDir */
export function prepareRemoteCipherPepper(outputDir) {
  const pepper = process.env.LLM_REMOTE_PUBLISH_CIPHER_PEPPER?.trim();
  if (!pepper) {
    console.warn(
      "embed-remote-cipher-pepper: LLM_REMOTE_PUBLISH_CIPHER_PEPPER not set; OSS publish config decrypt disabled in this build",
    );
    return;
  }

  const outPath = join(outputDir, "llm-remote-cipher-pepper.json");
  writeFileSync(
    outPath,
    `${JSON.stringify({ version: 1, pepper }, null, 2)}\n`,
    "utf8",
  );
  console.log(`embed-remote-cipher-pepper: wrote ${outPath}`);
}
