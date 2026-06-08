const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ListLlmModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string; status?: number };

export function parseLlmModelsResponse(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];

  const record = json as Record<string, unknown>;
  const fromData = extractModelIds(record.data);
  if (fromData.length) return fromData;

  const fromModels = extractModelIds(record.models);
  if (fromModels.length) return fromModels;

  return [];
}

function extractModelIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      ids.push(item.trim());
      continue;
    }
    if (item && typeof item === "object") {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function normalizeLlmListModelsBaseUrl(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "");
}

export async function fetchLlmEndpointModels(
  baseURL: string,
  apiKey: string,
  timeoutMs = 15_000,
): Promise<ListLlmModelsResult> {
  const normalizedBase = normalizeLlmListModelsBaseUrl(baseURL);
  const key = apiKey.trim();
  if (!normalizedBase) {
    return { ok: false, error: "Base URL 不能为空" };
  }
  if (!key) {
    return { ok: false, error: "API Key 不能为空" };
  }

  try {
    const response = await fetch(`${normalizedBase}/models`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "User-Agent": BROWSER_UA,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}${body ? `: ${body}` : ""}`,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, error: "响应不是有效 JSON" };
    }

    const models = parseLlmModelsResponse(json);
    if (!models.length) {
      return { ok: false, error: "未解析到可用 model id" };
    }

    return { ok: true, models };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
