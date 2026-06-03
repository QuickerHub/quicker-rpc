import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import type { LlmEndpointConfig } from "@/lib/llm-config";

type PublishConfigFile = {
  version?: number;
  endpoints?: unknown[];
};

function normalizePublishEndpoint(raw: unknown): LlmEndpointConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmEndpointConfig;
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  if (!apiKey) return undefined;
  const next: LlmEndpointConfig = { apiKey };
  if (typeof data.baseURL === "string" && data.baseURL.trim()) {
    next.baseURL = data.baseURL.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    next.model = data.model.trim();
  }
  return next;
}

export function resolveLlmPublishConfigPath(): string {
  const override = process.env.BUNDLED_LLM_CONFIG_PATH?.trim();
  if (override) return override;
  return join(resolveAgentGuiRoot(), "llm-publish.config.json");
}

/** Ordered endpoints from llm-publish.config.json (dev / local publish source). */
export function loadPublishConfigEndpoints(): LlmEndpointConfig[] {
  const path = resolveLlmPublishConfigPath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as PublishConfigFile;
    if (!Array.isArray(raw.endpoints)) return [];
    const endpoints: LlmEndpointConfig[] = [];
    for (const entry of raw.endpoints) {
      const normalized = normalizePublishEndpoint(entry);
      if (normalized) endpoints.push(normalized);
    }
    return endpoints;
  } catch {
    return [];
  }
}
