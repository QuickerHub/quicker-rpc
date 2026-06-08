import type { LlmEndpointConfig } from "@/lib/llm-config";
import { endpointConfigFingerprint } from "@/lib/llm-config";

export type LlmProbeConfigSource =
  | "publish"
  | "dev"
  | "merged"
  | "llm-config"
  | "auto"
  | "all";

export type LlmProbeMethod = "models" | "chat" | "full";

export type LlmEndpointProbeCheck = {
  ok: boolean;
  latencyMs: number;
  status?: number;
  message: string;
};

export type LlmEndpointProbeTarget = {
  id: string;
  sources: string[];
  group?: string;
  groupLabel?: string;
  model?: string;
  host: string;
  baseURL: string;
  maskedKey: string;
  apiKey: string;
};

export type LlmEndpointProbeRow = Omit<LlmEndpointProbeTarget, "apiKey"> & {
  ok: boolean;
  latencyMs: number;
  method: LlmProbeMethod;
  status?: number;
  message: string;
  /** Populated when method is "full". */
  models?: LlmEndpointProbeCheck;
  /** Populated when method is "full". */
  chat?: LlmEndpointProbeCheck;
};

export type LlmEndpointProbeSummary = {
  total: number;
  ok: number;
  fail: number;
  byGroup: Record<string, { ok: number; fail: number; reachable: boolean }>;
};

export type LlmEndpointProbeReport = {
  ok: boolean;
  checkedAt: string;
  source: LlmProbeConfigSource;
  method: LlmProbeMethod;
  timeoutMs: number;
  summary: LlmEndpointProbeSummary;
  rows: LlmEndpointProbeRow[];
  autoModels?: LlmEndpointProbeRow[];
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function maskLlmApiKey(apiKey: string | undefined): string {
  const key = apiKey?.trim() ?? "";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function hostFromLlmBaseUrl(baseURL: string | undefined): string {
  if (!baseURL?.trim()) return "(no baseURL)";
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

function normalizeBaseUrl(baseURL: string | undefined): string {
  return (baseURL ?? "").replace(/\/+$/, "");
}

export function targetFromEndpoint(
  endpoint: LlmEndpointConfig,
  sourceTag: string,
  meta?: { group?: string; groupLabel?: string },
): LlmEndpointProbeTarget {
  const baseURL = normalizeBaseUrl(endpoint.baseURL);
  const apiKey = endpoint.apiKey.trim();
  return {
    id: endpointConfigFingerprint({ ...endpoint, apiKey }),
    sources: [sourceTag],
    group: meta?.group ?? endpoint.group,
    groupLabel: meta?.groupLabel,
    model: endpoint.model?.trim(),
    host: hostFromLlmBaseUrl(baseURL),
    baseURL,
    maskedKey: maskLlmApiKey(apiKey),
    apiKey,
  };
}

export function mergeProbeTargets(
  bucket: Map<string, LlmEndpointProbeTarget>,
  target: LlmEndpointProbeTarget,
): void {
  const existing = bucket.get(target.id);
  if (!existing) {
    bucket.set(target.id, target);
    return;
  }
  for (const source of target.sources) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
  }
  if (!existing.group && target.group) existing.group = target.group;
  if (!existing.groupLabel && target.groupLabel) {
    existing.groupLabel = target.groupLabel;
  }
  if (!existing.model && target.model) existing.model = target.model;
}

export function parseLlmProbeConfigSource(
  raw: string | null | undefined,
): LlmProbeConfigSource {
  const value = raw?.trim().toLowerCase();
  if (
    value === "publish"
    || value === "dev"
    || value === "merged"
    || value === "llm-config"
    || value === "auto"
    || value === "all"
  ) {
    return value;
  }
  return "all";
}

export function parseLlmProbeMethod(
  raw: string | null | undefined,
): LlmProbeMethod {
  const value = raw?.trim().toLowerCase();
  if (value === "chat") return "chat";
  if (value === "full") return "full";
  return "models";
}

export function formatLlmEndpointProbeFullMessage(
  models: LlmEndpointProbeCheck,
  chat: LlmEndpointProbeCheck,
): string {
  return `models: ${models.message} | chat: ${chat.message}`;
}

async function probeModels(
  target: LlmEndpointProbeTarget,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number; status?: number; message: string }> {
  if (!target.apiKey) {
    return { ok: false, latencyMs: 0, message: "missing apiKey" };
  }
  if (!target.baseURL) {
    return { ok: false, latencyMs: 0, message: "missing baseURL" };
  }

  const started = Date.now();
  try {
    const response = await fetch(`${target.baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
        Accept: "application/json",
        "User-Agent": BROWSER_UA,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
      return {
        ok: false,
        latencyMs,
        status: response.status,
        message: `HTTP ${response.status}${body ? `: ${body}` : ""}`,
      };
    }

    let modelCount: number | undefined;
    try {
      const json = await response.json() as { data?: unknown[] };
      modelCount = Array.isArray(json.data) ? json.data.length : undefined;
    } catch {
      modelCount = undefined;
    }

    return {
      ok: true,
      latencyMs,
      status: response.status,
      message: modelCount != null ? `${modelCount} models` : "ok",
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeChat(
  target: LlmEndpointProbeTarget,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number; status?: number; message: string }> {
  if (!target.apiKey) {
    return { ok: false, latencyMs: 0, message: "missing apiKey" };
  }
  if (!target.baseURL) {
    return { ok: false, latencyMs: 0, message: "missing baseURL" };
  }
  const model = target.model?.trim();
  if (!model) {
    return { ok: false, latencyMs: 0, message: "missing model for chat probe" };
  }

  const started = Date.now();
  try {
    const response = await fetch(`${target.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": BROWSER_UA,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
      return {
        ok: false,
        latencyMs,
        status: response.status,
        message: `HTTP ${response.status}${body ? `: ${body}` : ""}`,
      };
    }

    let snippet = "ok";
    try {
      const json = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (content) snippet = content.slice(0, 40);
    } catch {
      snippet = "ok";
    }

    return {
      ok: true,
      latencyMs,
      status: response.status,
      message: snippet,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeFull(
  target: LlmEndpointProbeTarget,
  modelsTimeoutMs: number,
  chatTimeoutMs: number,
): Promise<{
  ok: boolean;
  latencyMs: number;
  status?: number;
  message: string;
  models: LlmEndpointProbeCheck;
  chat: LlmEndpointProbeCheck;
}> {
  const models = await probeModels(target, modelsTimeoutMs);
  const model = target.model?.trim();
  const chat = model
    ? await probeChat(target, chatTimeoutMs)
    : {
        ok: false,
        latencyMs: 0,
        message: "skipped: no model",
      };

  return {
    ok: models.ok && chat.ok,
    latencyMs: models.latencyMs + chat.latencyMs,
    status: chat.status ?? models.status,
    message: formatLlmEndpointProbeFullMessage(models, chat),
    models,
    chat,
  };
}

export async function probeLlmEndpointTarget(
  target: LlmEndpointProbeTarget,
  options?: {
    method?: LlmProbeMethod;
    timeoutMs?: number;
    chatTimeoutMs?: number;
  },
): Promise<LlmEndpointProbeRow> {
  const method = options?.method ?? "models";
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const chatTimeoutMs = options?.chatTimeoutMs ?? Math.max(timeoutMs, 90_000);
  const { apiKey: _apiKey, ...publicTarget } = target;

  if (method === "full") {
    const full = await probeFull(target, timeoutMs, chatTimeoutMs);
    return {
      ...publicTarget,
      ok: full.ok,
      latencyMs: full.latencyMs,
      method,
      status: full.status,
      message: full.message,
      models: full.models,
      chat: full.chat,
    };
  }

  const result = method === "chat"
    ? await probeChat(target, timeoutMs)
    : await probeModels(target, timeoutMs);

  return {
    ...publicTarget,
    ok: result.ok,
    latencyMs: result.latencyMs,
    method,
    status: result.status,
    message: result.message,
  };
}

export function buildLlmProbeSummary(
  rows: readonly LlmEndpointProbeRow[],
): LlmEndpointProbeSummary {
  const byGroup: LlmEndpointProbeSummary["byGroup"] = {};
  let ok = 0;
  for (const row of rows) {
    if (row.ok) ok += 1;
    const label = row.groupLabel ?? row.group ?? "(ungrouped)";
    const bucket = byGroup[label] ?? { ok: 0, fail: 0, reachable: false };
    if (row.ok) {
      bucket.ok += 1;
      bucket.reachable = true;
    } else {
      bucket.fail += 1;
    }
    byGroup[label] = bucket;
  }
  return {
    total: rows.length,
    ok,
    fail: rows.length - ok,
    byGroup,
  };
}

export async function runLlmEndpointProbeReport(options: {
  source: LlmProbeConfigSource;
  method: LlmProbeMethod;
  timeoutMs: number;
  chatTimeoutMs?: number;
  concurrency?: number;
  includeAutoModels?: boolean;
  listTargets: (source: LlmProbeConfigSource) => LlmEndpointProbeTarget[];
}): Promise<LlmEndpointProbeReport> {
  const {
    source,
    method,
    timeoutMs,
    listTargets,
  } = options;
  const chatTimeoutMs = options.chatTimeoutMs ?? Math.max(timeoutMs, 90_000);
  const concurrency = Math.max(
    1,
    method === "full" ? 1 : (options.concurrency ?? 4),
  );
  const includeAutoModels = options.includeAutoModels
    ?? (source === "all" || source === "merged" || source === "auto");

  const probeRows = async (
    targets: readonly LlmEndpointProbeTarget[],
    probeMethod: LlmProbeMethod,
    probeTimeoutMs: number,
    probeChatTimeoutMs: number,
  ): Promise<LlmEndpointProbeRow[]> => {
    const filtered = targets.filter((target) => {
      if (probeMethod === "chat") return Boolean(target.model?.trim());
      return true;
    });
    const out: LlmEndpointProbeRow[] = [];
    for (let i = 0; i < filtered.length; i += concurrency) {
      const batch = filtered.slice(i, i + concurrency);
      const batchRows = await Promise.all(
        batch.map((target) => probeLlmEndpointTarget(target, {
          method: probeMethod,
          timeoutMs: probeTimeoutMs,
          chatTimeoutMs: probeChatTimeoutMs,
        })),
      );
      out.push(...batchRows);
    }
    return out;
  };

  let rows: LlmEndpointProbeRow[];
  let autoModels: LlmEndpointProbeRow[] | undefined;

  if (source === "auto") {
    rows = await probeRows(
      listTargets("auto"),
      "chat",
      Math.max(timeoutMs, 25_000),
      chatTimeoutMs,
    );
    autoModels = rows;
  } else {
    rows = await probeRows(listTargets(source), method, timeoutMs, chatTimeoutMs);
    if (includeAutoModels) {
      autoModels = await probeRows(
        listTargets("auto"),
        "chat",
        Math.max(timeoutMs, 25_000),
        chatTimeoutMs,
      );
    }
  }

  const failed = rows.filter((row) => !row.ok).length
    + (autoModels?.filter((row) => !row.ok).length ?? 0);

  return {
    ok: failed === 0,
    checkedAt: new Date().toISOString(),
    source,
    method,
    timeoutMs,
    summary: buildLlmProbeSummary(rows),
    rows,
    autoModels,
  };
}
