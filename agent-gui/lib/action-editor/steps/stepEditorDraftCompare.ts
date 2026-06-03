import type { ActionStep, ActionStepParam } from "@/lib/action-editor/types/common";

function normalizeActionStepParam(p: ActionStepParam | undefined): { varKey: string; value: string } {
  return { varKey: p?.varKey ?? "", value: p?.value ?? "" };
}

export function areInputParamsEqual(
  prevParams: { [key: string]: ActionStepParam } | undefined,
  nextParams: { [key: string]: ActionStepParam } | undefined
): boolean {
  const a = prevParams ?? {};
  const b = nextParams ?? {};
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = normalizeActionStepParam(a[k]);
    const vb = normalizeActionStepParam(b[k]);
    if (va.varKey !== vb.varKey || va.value !== vb.value) {
      return false;
    }
  }
  return true;
}

export function areOutputParamsEqual(
  prevParams: { [key: string]: string } | undefined,
  nextParams: { [key: string]: string } | undefined
): boolean {
  const a = prevParams ?? {};
  const b = nextParams ?? {};
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? "") !== (b[k] ?? "")) {
      return false;
    }
  }
  return true;
}

export function isStepEditorDraftDirty(original: ActionStep, draft: ActionStep): boolean {
  return (
    !areInputParamsEqual(original.inputParams, draft.inputParams) ||
    !areOutputParamsEqual(original.outputParams, draft.outputParams)
  );
}
