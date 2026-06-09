#!/usr/bin/env node
/**
 * Probe remote voice-asr plugin channel URLs (gallery bootstrap).
 *
 * Usage: node agent-gui/scripts/test-plugin-channel-fetch.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapPath = join(
  root,
  "src-tauri/voice-plugin-metadata/plugin-registry-bootstrap.json",
);
const bootstrap = JSON.parse(readFileSync(bootstrapPath, "utf8"));
const entry = bootstrap.offlineFallbackRegistry.plugins["voice-asr"];

async function probe(label, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    if (!res.ok || text.trimStart().startsWith("<")) {
      console.log(`${label}: failed status=${res.status} (not JSON — upload mirror?)`);
      return null;
    }
    const json = JSON.parse(text);
    console.log(
      `${label}: ok=${res.ok} runtimeVersion=${json.runtimeVersion ?? "(missing)"}`,
    );
    return json;
  } catch (err) {
    console.log(`${label}: error ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

console.log("Probing voice-asr channel URLs from plugin-registry-bootstrap.json...");
if (entry.activationEvents?.length) {
  console.log(`activationEvents: ${entry.activationEvents.join(", ")}`);
}
await probe("primary", entry.channelUrl);
if (entry.channelMirrorUrl) {
  await probe("mirror", entry.channelMirrorUrl);
}

const localAppData =
  process.env.LOCALAPPDATA?.trim()
  || join(homedir(), "AppData", "Local");
const cache = join(localAppData, "QuickerAgent", "cache", "voice-asr-channel.json");
console.log(`local cache: ${existsSync(cache) ? cache : "(none)"}`);
