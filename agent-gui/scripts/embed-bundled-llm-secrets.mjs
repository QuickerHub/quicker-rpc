/**
 * Embed obfuscated LLM API keys into the Tauri app bundle at publish time.
 *
 * Preferred: one JSON config with multiple endpoints (url + apiKey + model):
 *   BUNDLED_LLM_CONFIG_PATH=./llm-publish.config.json
 *   BUNDLED_LLM_CONFIG='{"version":1,"endpoints":[...]}'   # GitHub Actions secret
 *
 * Legacy single-key env vars still work:
 *   BUNDLED_LLM_BINGLEIMUZI_API_KEY=sk-...
 *   BUNDLED_LLM_PROVIDERS=bingleimuzi
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSecret } from "./llm-secret-cipher.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");
const DEFAULT_PROVIDER_ID = "bingleimuzi";
const BUNDLED_ENDPOINT_CIPHER_PREFIX = `${DEFAULT_PROVIDER_ID}:`;

const ALL_PROVIDER_IDS = [
  "zen",
  "nvidia",
  "deepseek",
  "chatanywhere",
  "bingleimuzi",
];

const DEFAULT_BUNDLED_PROVIDERS = [DEFAULT_PROVIDER_ID];

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

function readExampleDefaults() {
  const examplePath = join(agentGuiRoot, "llm-config.example.json");
  if (!existsSync(examplePath)) {
    return {
      baseURL: "https://api.bingleimuzi.eu.cc/v1",
      model: "gpt-5.5",
    };
  }
  const config = JSON.parse(readFileSync(examplePath, "utf8"));
  const entry =
    config?.providers?.default
    ?? config?.providers?.bingleimuzi
    ?? {};
  return {
    baseURL:
      typeof entry.baseURL === "string" && entry.baseURL.trim()
        ? entry.baseURL.trim()
        : "https://api.bingleimuzi.eu.cc/v1",
    model:
      typeof entry.model === "string" && entry.model.trim()
        ? entry.model.trim()
        : "gpt-5.5",
  };
}

/** @param {unknown} raw */
function normalizePublishEndpoint(raw, defaults) {
  if (typeof raw !== "object" || raw === null) return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  if (!apiKey) return null;
  /** @type {{ apiKey: string, baseURL?: string, model?: string }} */
  const endpoint = { apiKey };
  const baseURL =
    typeof data.baseURL === "string" && data.baseURL.trim()
      ? data.baseURL.trim()
      : defaults.baseURL;
  const model =
    typeof data.model === "string" && data.model.trim()
      ? data.model.trim()
      : defaults.model;
  if (baseURL) endpoint.baseURL = baseURL;
  if (model) endpoint.model = model;
  return endpoint;
}

function readPublishConfigRaw() {
  const path = process.env.BUNDLED_LLM_CONFIG_PATH?.trim();
  if (path) {
    if (!existsSync(path)) {
      throw new Error(`BUNDLED_LLM_CONFIG_PATH not found: ${path}`);
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }
  const inline = process.env.BUNDLED_LLM_CONFIG?.trim();
  if (inline) {
    return JSON.parse(inline);
  }
  return null;
}

/** @param {unknown} raw */
function readPublishSponsors(raw) {
  if (typeof raw !== "object" || raw === null) return {};
  const sponsors = /** @type {Record<string, unknown>} */ (raw).sponsors;
  if (typeof sponsors !== "object" || sponsors === null) return {};
  /** @type {Record<string, { name: string, url: string }>} */
  const out = {};
  for (const id of ["bingleimuzi", "deepseek"]) {
    const entry = sponsors[id];
    if (typeof entry !== "object" || entry === null) continue;
    const data = /** @type {Record<string, unknown>} */ (entry);
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const url = typeof data.url === "string" ? data.url.trim() : "";
    if (!name || !url || !/^https?:\/\//i.test(url)) continue;
    out[id] = { name, url };
  }
  return out;
}

function isDeepSeekPublishEndpoint(endpoint, defaults) {
  const model = (endpoint.model ?? defaults.model ?? "").trim().toLowerCase();
  return model.startsWith("deepseek");
}

function endpointsFromPublishConfig(raw, { gptOnly = false } = {}) {
  if (typeof raw !== "object" || raw === null) return [];
  const data = /** @type {Record<string, unknown>} */ (raw);
  const defaults = readExampleDefaults();
  if (Array.isArray(data.endpoints)) {
    return data.endpoints
      .map((entry) => normalizePublishEndpoint(entry, defaults))
      .filter(Boolean)
      .filter((endpoint) => {
        const deepseek = isDeepSeekPublishEndpoint(endpoint, defaults);
        if (gptOnly) return !deepseek;
        return true;
      });
  }
  return [];
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
  if (providerId === DEFAULT_PROVIDER_ID) {
    const legacyBundled = process.env.BUNDLED_LLM_AI98PRO_API_KEY?.trim();
    if (legacyBundled) return legacyBundled;
  }
  const direct = process.env[`LLM_${upper}_API_KEY`]?.trim();
  if (direct) return direct;
  if (providerId === DEFAULT_PROVIDER_ID) {
    return process.env.LLM_AI98PRO_API_KEY?.trim();
  }
  return undefined;
}

function resolvePublishEndpoints({ gptOnly = false } = {}) {
  const fromConfig = endpointsFromPublishConfig(readPublishConfigRaw(), { gptOnly });
  if (fromConfig.length) return fromConfig;

  const defaults = readExampleDefaults();
  const providerIds = parseBundledProviders();
  /** @type {{ apiKey: string, baseURL?: string, model?: string }[]} */
  const endpoints = [];
  for (const providerId of providerIds) {
    const apiKey = envKeyForProvider(providerId);
    if (!apiKey) continue;
    endpoints.push({
      apiKey,
      baseURL: defaults.baseURL,
      model: providerId === "deepseek" ? "deepseek-v4-pro" : defaults.model,
    });
  }
  return gptOnly
    ? endpoints.filter((endpoint) => !isDeepSeekPublishEndpoint(endpoint, defaults))
    : endpoints;
}

/**
 * @param {string} outputDir
 * @param {{ apiKey: string, baseURL?: string, model?: string }[]} endpoints
 */
function stageBundledLlmConfig(outputDir, endpoints) {
  const defaults = readExampleDefaults();
  /** @type {Record<string, unknown>} */
  let providerEntry;
  if (endpoints.length === 0) {
    const examplePath = join(agentGuiRoot, "llm-config.example.json");
    if (!existsSync(examplePath)) {
      throw new Error(`Missing ${examplePath}`);
    }
    const config = JSON.parse(readFileSync(examplePath, "utf8"));
    providerEntry =
      config?.providers?.default
      ?? config?.providers?.bingleimuzi
      ?? {};
    if (typeof providerEntry === "object" && providerEntry !== null) {
      providerEntry = { ...providerEntry, apiKey: "" };
      if (Array.isArray(providerEntry.fallbacks)) {
        providerEntry.fallbacks = providerEntry.fallbacks.map((fb) => ({
          ...fb,
          apiKey: "",
        }));
      }
    }
  } else {
    const [primary, ...fallbacks] = endpoints;
    providerEntry = {
      baseURL: primary.baseURL ?? defaults.baseURL,
      model: primary.model ?? defaults.model,
      fallbacks: fallbacks.map((fb) => ({
        baseURL: fb.baseURL ?? defaults.baseURL,
        model: fb.model ?? defaults.model,
      })),
    };
  }

  const config = {
    version: 1,
    endpoints: endpoints.map((ep) => ({
      baseURL: ep.baseURL ?? defaults.baseURL,
      model: ep.model ?? defaults.model,
    })),
    providers: {
      default: providerEntry,
    },
  };
  const publishRaw = readPublishConfigRaw();
  const sponsors = readPublishSponsors(publishRaw);
  if (Object.keys(sponsors).length > 0) {
    config.sponsors = sponsors;
  }
  const outPath = join(outputDir, "llm-config.json");
  writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(`embed-bundled-llm-secrets: wrote bundled llm-config.json -> ${outPath}`);
}

/**
 * @param {string} outputDir Next standalone app dir (resources/app)
 */
export function prepareBundledLlmRuntime(outputDir) {
  const gptEndpoints = resolvePublishEndpoints({ gptOnly: true });
  const allEndpoints = resolvePublishEndpoints();
  stageBundledLlmConfig(outputDir, gptEndpoints);
  return embedBundledLlmSecretsWithEndpoints(outputDir, allEndpoints);
}

function embedBundledLlmSecretsWithEndpoints(outputDir, endpoints) {
  const appVersion = readSemver();
  const outPath = join(outputDir, "llm-bundled-secrets.json");

  if (endpoints.length === 0) {
    console.log(
      "embed-bundled-llm-secrets: no BUNDLED_LLM_CONFIG or BUNDLED_LLM_* env vars; skipping bundled keys",
    );
    return { wrote: false, path: outPath, endpoints: 0 };
  }

  /** @type {{ enc: string, baseURL?: string, model?: string }[]} */
  const bundledEndpoints = endpoints.map((endpoint, index) => {
    const next = {
      enc: encodeSecret(
        endpoint.apiKey,
        appVersion,
        `${BUNDLED_ENDPOINT_CIPHER_PREFIX}${index}`,
      ),
    };
    if (endpoint.baseURL) next.baseURL = endpoint.baseURL;
    if (endpoint.model) next.model = endpoint.model;
    return next;
  });

  /** @type {Record<string, unknown>} */
  const payload = {
    version: 2,
    appVersion,
    endpoints: bundledEndpoints,
  };
  if (endpoints.length === 1) {
    payload.providers = {
      [DEFAULT_PROVIDER_ID]: {
        enc: encodeSecret(endpoints[0].apiKey, appVersion, DEFAULT_PROVIDER_ID),
      },
    };
  }

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  console.log(
    `embed-bundled-llm-secrets: wrote ${endpoints.length} endpoint(s) -> ${outPath}`,
  );
  return { wrote: true, path: outPath, endpoints: endpoints.length };
}

export function embedBundledLlmSecrets(outputDir) {
  return embedBundledLlmSecretsWithEndpoints(outputDir, resolvePublishEndpoints());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: node embed-bundled-llm-secrets.mjs <outputDir>");
    process.exit(1);
  }
  prepareBundledLlmRuntime(outDir);
}
