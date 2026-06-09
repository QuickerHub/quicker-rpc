import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import { normalizeStepRunnerKeyTail } from "./actionStepNodeView";

/** True when two runner keys refer to the same module (e.g. delay vs sys:delay). */
export function stepRunnerKeysEquivalent(a: string, b: string): boolean {
  const ta = normalizeStepRunnerKeyTail(a);
  const tb = normalizeStepRunnerKeyTail(b);
  return ta.length > 0 && ta === tb;
}

/** Keys to try when resolving catalog / get-ui (bare legacy key → sys: prefix). */
export function resolveStepRunnerKeyCandidates(stepRunnerKey: string): string[] {
  const k = (stepRunnerKey ?? "").trim();
  if (!k) {
    return [];
  }
  const out: string[] = [k];
  if (!k.toLowerCase().startsWith("sys:")) {
    out.push(`sys:${k}`);
  }
  return [...new Set(out)];
}

/** Pick catalog row for a step key (exact match, then tail equivalence). */
export function resolveRunnerItemForStepKey(
  items: readonly StepRunnerItem[],
  stepRunnerKey: string,
): StepRunnerItem | undefined {
  const k = (stepRunnerKey ?? "").trim();
  if (!k) {
    return undefined;
  }

  for (const it of items) {
    const itemKey = (it.key ?? "").trim();
    if (itemKey === k) {
      return it;
    }
    for (const sub of it.subItems ?? []) {
      if ((sub.key ?? "").trim() === k) {
        return it;
      }
    }
  }

  for (const it of items) {
    if (stepRunnerKeysEquivalent(it.key ?? "", k)) {
      return it;
    }
    for (const sub of it.subItems ?? []) {
      if (stepRunnerKeysEquivalent(sub.key ?? "", k)) {
        return it;
      }
    }
  }

  return undefined;
}

/** Canonical key for backend get-ui (prefer catalog hit, else sys: alias). */
export function resolveCanonicalStepRunnerKey(
  stepRunnerKey: string,
  catalogItems?: readonly StepRunnerItem[],
): string {
  const k = (stepRunnerKey ?? "").trim();
  if (!k) {
    return k;
  }
  const hit = catalogItems?.length ? resolveRunnerItemForStepKey(catalogItems, k) : undefined;
  if (hit?.key?.trim()) {
    return hit.key.trim();
  }
  const candidates = resolveStepRunnerKeyCandidates(k);
  return candidates[candidates.length - 1] ?? k;
}
