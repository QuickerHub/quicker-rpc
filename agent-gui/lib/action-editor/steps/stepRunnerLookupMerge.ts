import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";

/** Flattened metadata for one step runner key (top-level or sub-item). */
export type StepRunnerEntry = {
  key: string;
  name: string;
  description: string;
  icon: string;
  /** Quicker StepType string from backend, e.g. If, Loop, Action. */
  stepType: string;
};

export type StepRunnerLookup = Record<string, StepRunnerEntry>;

export function stepRunnerEntryFromItem(item: StepRunnerItem): StepRunnerEntry {
  return {
    key: item.key,
    name: item.name ?? "",
    description: item.description ?? "",
    icon: (item.icon ?? "").trim(),
    stepType: (item.stepType ?? "").trim(),
  };
}

function pickStepRunnerIcon(...candidates: readonly (string | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = (candidate ?? "").trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

/** Merge lookup layers; never let a later empty icon erase an earlier non-empty icon. */
export function mergeStepRunnerLookupEntries(
  ...layers: readonly StepRunnerLookup[]
): StepRunnerLookup {
  const out: StepRunnerLookup = {};
  for (const layer of layers) {
    for (const [key, entry] of Object.entries(layer)) {
      const prev = out[key];
      if (!prev) {
        out[key] = { ...entry };
        continue;
      }
      out[key] = {
        key,
        name: (entry.name ?? "").trim() ? entry.name : prev.name,
        description: (entry.description ?? "").trim() ? entry.description : prev.description,
        icon: pickStepRunnerIcon(entry.icon, prev.icon),
        stepType: (entry.stepType ?? "").trim() ? entry.stepType : prev.stepType,
      };
    }
  }
  return out;
}

export function buildCatalogIconLookup(items: readonly StepRunnerItem[]): StepRunnerLookup {
  const out: StepRunnerLookup = {};
  for (const item of items) {
    const entry = stepRunnerEntryFromItem(item);
    if (!entry.key) continue;
    out[entry.key] = entry;
  }
  return out;
}

/** Drop icon-less rows before localStorage persist (empty icon must not be cached). */
export function sanitizeStepRunnerLookupForPersist(
  lookup: StepRunnerLookup,
  catalogLookup?: StepRunnerLookup,
): StepRunnerLookup {
  const enriched = catalogLookup
    ? mergeStepRunnerLookupEntries(lookup, catalogLookup)
    : lookup;
  const out: StepRunnerLookup = {};
  for (const [key, entry] of Object.entries(enriched)) {
    if (!(entry.icon ?? "").trim()) {
      continue;
    }
    out[key] = entry;
  }
  return out;
}

export function pickStepRunnerIconForMerge(...candidates: readonly (string | undefined)[]): string {
  return pickStepRunnerIcon(...candidates);
}
