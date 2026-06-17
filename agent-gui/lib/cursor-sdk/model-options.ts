export type CursorSdkModelOption = {
  id: string;
  label: string;
};

/** Cursor API may return `default` while the SDK uses `auto`. */
const MODEL_ID_ALIASES: Record<string, string> = {
  default: "auto",
};

/** Shown at the top when present in the remote catalog. */
const FEATURED_MODEL_IDS = [
  "auto",
  "composer-2.5",
  "gpt-5.3-codex",
  "claude-sonnet-4-6",
] as const;

export function normalizeCursorSdkModelId(modelId: string): string {
  return MODEL_ID_ALIASES[modelId] ?? modelId;
}

export function mergeCursorSdkModelOptions(
  builtin: readonly CursorSdkModelOption[],
  remote?: readonly CursorSdkModelOption[],
): CursorSdkModelOption[] {
  if (!remote?.length) {
    return [...builtin];
  }

  const byId = new Map<string, CursorSdkModelOption>();
  for (const item of remote) {
    const id = normalizeCursorSdkModelId(item.id);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        label: item.label.trim() || id,
      });
    }
  }
  for (const item of builtin) {
    if (!byId.has(item.id)) {
      byId.set(item.id, { ...item });
    }
  }

  const featured: CursorSdkModelOption[] = [];
  const featuredIds = new Set<string>();
  for (const id of FEATURED_MODEL_IDS) {
    const option = byId.get(id);
    if (!option) continue;
    featured.push(option);
    featuredIds.add(id);
  }

  const rest = [...byId.values()]
    .filter((item) => !featuredIds.has(item.id))
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));

  return [...featured, ...rest];
}

export function filterCursorSdkModelOptions(
  options: readonly CursorSdkModelOption[],
  query: string,
): CursorSdkModelOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter(
    (opt) =>
      opt.id.toLowerCase().includes(q)
      || opt.label.toLowerCase().includes(q),
  );
}
