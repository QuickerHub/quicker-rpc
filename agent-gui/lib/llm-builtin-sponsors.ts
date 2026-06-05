import {
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type LlmBuiltinSponsor = {
  name: string;
  url: string;
};

export type LlmBuiltinSponsorsMap = Partial<
  Record<LlmProviderId, LlmBuiltinSponsor>
>;

/** Fallback when publish / bundled config omits sponsors. */
export const DEFAULT_BUILTIN_SPONSORS: LlmBuiltinSponsorsMap = {
  [LLM_PROVIDER_ID]: {
    name: "CL",
    url: "https://getquicker.net/User/Actions/3-CL",
  },
  [DEEPSEEK_PROVIDER_ID]: {
    name: "冰雷木子",
    url: "https://getquicker.net/User/Actions/749380-%E5%86%B0%E9%9B%B7%E6%9C%A8%E5%AD%90",
  },
};

const BUILTIN_SPONSOR_PROVIDER_IDS = [
  LLM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
] as const satisfies readonly LlmProviderId[];

export function normalizeBuiltinSponsor(
  raw: unknown,
): LlmBuiltinSponsor | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!name || !url) return undefined;
  if (!/^https?:\/\//i.test(url)) return undefined;
  return { name, url };
}

/** Parse `sponsors` object from llm-publish.config.json or bundled llm-config.json. */
export function parseBuiltinSponsorsMap(raw: unknown): LlmBuiltinSponsorsMap {
  if (typeof raw !== "object" || raw === null) return {};
  const data = raw as Record<string, unknown>;
  const sponsorsRaw = data.sponsors;
  if (typeof sponsorsRaw !== "object" || sponsorsRaw === null) return {};
  const map = sponsorsRaw as Record<string, unknown>;
  const out: LlmBuiltinSponsorsMap = {};
  for (const id of BUILTIN_SPONSOR_PROVIDER_IDS) {
    const entry = normalizeBuiltinSponsor(map[id]);
    if (entry) out[id] = entry;
  }
  return out;
}

export function mergeBuiltinSponsors(
  ...layers: LlmBuiltinSponsorsMap[]
): LlmBuiltinSponsorsMap {
  return Object.assign({}, ...layers);
}

export function resolveBuiltinSponsor(
  map: LlmBuiltinSponsorsMap,
  providerId: LlmProviderId,
): LlmBuiltinSponsor | undefined {
  return map[providerId] ?? DEFAULT_BUILTIN_SPONSORS[providerId];
}
