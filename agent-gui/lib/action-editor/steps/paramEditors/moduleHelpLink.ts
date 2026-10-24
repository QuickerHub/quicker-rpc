import type { StepRunnerItem } from "../../types/action_query";

/** UI-only metadata; generated protobuf types remain unchanged. Never infer a URL from a key. */
export function moduleHelpLink(item: StepRunnerItem | undefined): string {
  const value = (item as (StepRunnerItem & { helpLink?: unknown }) | undefined)?.helpLink;
  return safeModuleHelpUrl(value);
}

export function safeModuleHelpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.toString() : "";
  } catch { return ""; }
}

/** Native docs embed contract, preserving the module's own path, query and anchor. */
export function withDocsEmbedQuery(value: string): string {
  const safe = safeModuleHelpUrl(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.searchParams.set("embed", "1");
  return url.toString();
}
