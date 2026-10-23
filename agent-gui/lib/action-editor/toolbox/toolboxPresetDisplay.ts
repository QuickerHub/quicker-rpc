export type ControlPresetCatalogItem = {
  key?: string;
  inputParamDefs?: Array<{
    key?: string;
    isControlField?: boolean;
    selectionItems?: Array<{ value?: string; name?: string }>;
  }>;
};

/** Control-field option name for a nested preset (type + another enum). */
export function resolveControlPresetDisplayName(
  presets: Record<string, string> | undefined,
  runner: ControlPresetCatalogItem | undefined
): string | undefined {
  if (!presets || !runner?.inputParamDefs) {
    return undefined;
  }
  const keys = Object.keys(presets);
  if (keys.length < 2) {
    return undefined;
  }
  const control =
    runner.inputParamDefs.find((d) => d.isControlField) ??
    runner.inputParamDefs.find((d) => {
      const k = (d.key ?? "").trim();
      return k.length > 0 && Object.prototype.hasOwnProperty.call(presets, k);
    });
  const key = (control?.key ?? "").trim();
  if (!key) {
    return undefined;
  }
  const wire = (presets[key] ?? "").trim();
  if (!wire) {
    return undefined;
  }
  const name = control?.selectionItems?.find((s) => (s.value ?? "").trim() === wire)?.name?.trim();
  return name || wire;
}

/** Only colliding sibling labels get a context suffix (avoids lengthening unique names). */
export function pickCollisionContextSuffix(
  labels: string[],
  contexts: Array<string | undefined>
): Array<string | undefined> {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return labels.map((label, i) => {
    if ((counts.get(label) ?? 0) < 2) {
      return undefined;
    }
    const ctx = (contexts[i] ?? "").trim();
    if (!ctx || label.includes(ctx)) {
      return undefined;
    }
    return ctx;
  });
}
