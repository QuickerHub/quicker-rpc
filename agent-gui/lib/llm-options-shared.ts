import type { LlmProviderId } from "@/lib/llm-providers";
import { parseLlmSelection } from "@/lib/llm-selection";

/** Client-safe LLM picker types (no fs/crypto imports). */
export type LlmModelOption = {
  selection: string;
  kind: "builtin" | "profile";
  providerId?: LlmProviderId;
  profileId?: string;
  label: string;
  title?: string;
  description: string;
  modelId: string;
  configured: boolean;
  contextLimit: number;
  contextLimitSource?: "env" | "catalog" | "pattern" | "default";
};

export type LlmOptionsResponse = {
  defaultSelection: string;
  activeSelection: string;
  options: LlmModelOption[];
  directOverride: boolean;
};

export function pickInitialLlmSelection(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  const configured = data.options.filter((o) => o.configured);

  if (
    data.activeSelection
    && configured.some((o) => o.selection === data.activeSelection)
  ) {
    return data.activeSelection;
  }

  if (storedRaw && configured.some((o) => o.selection === storedRaw)) {
    return storedRaw;
  }

  const parsed = parseLlmSelection(storedRaw);
  if (parsed?.kind === "builtin") {
    const legacy = configured.find(
      (o) => o.kind === "builtin" && o.providerId === parsed.providerId,
    );
    if (legacy) return legacy.selection;
  }

  if (
    data.defaultSelection
    && configured.some((o) => o.selection === data.defaultSelection)
  ) {
    return data.defaultSelection;
  }

  return configured[0]?.selection ?? data.defaultSelection;
}

export function findLlmModelOption(
  options: LlmModelOption[],
  selection: string,
): LlmModelOption | undefined {
  return options.find((o) => o.selection === selection);
}
