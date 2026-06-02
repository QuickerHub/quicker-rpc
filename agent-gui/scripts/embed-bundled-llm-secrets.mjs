/**
 * Embed obfuscated LLM API keys into the Tauri app bundle at publish time.
 *
 * Set env vars before `pnpm tauri build` / Publish-QuickerAgent.ps1:
 *   BUNDLED_LLM_BINGLEIMUZI_API_KEY=sk-...
 * Optional comma list (default: bingleimuzi):
 *   BUNDLED_LLM_PROVIDERS=bingleimuzi
 *
 * Falls back to LLM_<PROVIDER>_API_KEY when BUNDLED_LLM_* is unset.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSecret } from "./llm-secret-cipher.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");

const ALL_PROVIDER_IDS = [
  "zen",
  "nvidia",
  "deepseek",
  "chatanywhere",
  "bingleimuzi",
];

const DEFAULT_BUNDLED_PROVIDERS = ["bingleimuzi"];

function readSemver() {
  const raw = readFileSync(join(repoRoot, "version.json"), "utf8");
  const data = JSON.parse(raw);
  const parts = String(data.QuickerRpc ?? "0.0.0")
    .trim()
    .replace(/^v/, "")
    .split(".");
  if (parts.length < 3) {
    throw new Error("version.json QuickerRpc must have at least 3 segments");
  }
  return parts.slice(0, 3).join(".");
}

function parseBundledProviders() {
  const raw = process.env.BUNDLED_LLM_PROVIDERS?.trim();
  if (!raw) return DEFAULT_BUNDLED_PROVIDERS;
  const ids = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  for (const id of ids) {
    if (!ALL_PROVIDER_IDS.includes(id)) {
      throw new Error(`Unknown provider in BUNDLED_LLM_PROVIDERS: ${id}`);
    }
  }
  return ids.length > 0 ? ids : DEFAULT_BUNDLED_PROVIDERS;
}

function envKeyForProvider(providerId) {
  const upper = providerId.toUpperCase();
  const bundled = process.env[`BUNDLED_LLM_${upper}_API_KEY`]?.trim();
  if (bundled) return bundled;
  if (providerId === "bingleimuzi") {
    const legacyBundled = process.env.BUNDLED_LLM_AI98PRO_API_KEY?.trim();
    if (legacyBundled) return legacyBundled;
  }
  const direct = process.env[`LLM_${upper}_API_KEY`]?.trim();
  if (direct) return direct;
  if (providerId === "bingleimuzi") {
    return process.env.LLM_AI98PRO_API_KEY?.trim();
  }
  return undefined;
}

/**
 * @param {string} outputDir Next standalone app dir (resources/app)
 */
export function embedBundledLlmSecrets(outputDir) {
  const appVersion = readSemver();
  const providerIds = parseBundledProviders();
  /** @type {Record<string, { enc: string }>} */
  const providers = {};

  for (const providerId of providerIds) {
    const apiKey = envKeyForProvider(providerId);
    if (!apiKey) continue;
    providers[providerId] = {
      enc: encodeSecret(apiKey, appVersion, providerId),
    };
  }

  const outPath = join(outputDir, "llm-bundled-secrets.json");
  if (Object.keys(providers).length === 0) {
    console.log(
      "embed-bundled-llm-secrets: no BUNDLED_LLM_* env vars; skipping bundled keys",
    );
    return { wrote: false, path: outPath, providers: [] };
  }

  const payload = {
    version: 1,
    appVersion,
    providers,
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(
    `embed-bundled-llm-secrets: wrote ${Object.keys(providers).join(", ")} -> ${outPath}`,
  );
  return { wrote: true, path: outPath, providers: Object.keys(providers) };
}

function stageBundledLlmConfig(outputDir) {
  const examplePath = join(agentGuiRoot, "llm-config.example.json");
  if (!existsSync(examplePath)) {
    throw new Error(`Missing ${examplePath}`);
  }
  const config = JSON.parse(readFileSync(examplePath, "utf8"));
  if (typeof config.providers === "object" && config.providers !== null) {
    for (const providerId of ALL_PROVIDER_IDS) {
      const entry = config.providers[providerId];
      if (entry && typeof entry === "object") {
        entry.apiKey = "";
      }
    }
  }
  const outPath = join(outputDir, "llm-config.json");
  writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`embed-bundled-llm-secrets: wrote bundled llm-config.json -> ${outPath}`);
}

/**
 * @param {string} outputDir
 */
export function prepareBundledLlmRuntime(outputDir) {
  stageBundledLlmConfig(outputDir);
  return embedBundledLlmSecrets(outputDir);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: node embed-bundled-llm-secrets.mjs <outputDir>");
    process.exit(1);
  }
  prepareBundledLlmRuntime(outDir);
}
