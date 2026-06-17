import { formatVkName, isModifierVk, vkFromKeyName, VK } from "./vkCatalog";

/** Mirrors Quicker KeyInputStepData (JSON wire for sys:keyInput keys param). */
export type KeyInputStepData = {
  ctrlKeys: number[];
  keys: number[];
};

const EMPTY: KeyInputStepData = { ctrlKeys: [], keys: [] };

type WireJson = {
  CtrlKeys?: unknown;
  Keys?: unknown;
};

function toVkArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "number" ? x : Number.parseInt(String(x), 10)))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function emptyKeyInputStepData(): KeyInputStepData {
  return { ctrlKeys: [], keys: [] };
}

export function isKeyInputWireJson(raw: string): boolean {
  const text = (raw ?? "").trim();
  if (!text.startsWith("{")) return false;
  try {
    parseKeyInputStepData(text);
    return true;
  } catch {
    return false;
  }
}

export function parseKeyInputStepData(raw: string): KeyInputStepData {
  const text = (raw ?? "").trim();
  if (!text) return { ...EMPTY };
  const parsed = JSON.parse(text) as WireJson;
  return {
    ctrlKeys: toVkArray(parsed.CtrlKeys),
    keys: toVkArray(parsed.Keys),
  };
}

export function serializeKeyInputStepData(data: KeyInputStepData): string {
  const ctrlKeys = [...data.ctrlKeys];
  const keys = [...data.keys];
  if (ctrlKeys.length === 0 && keys.length === 0) {
    return JSON.stringify({ CtrlKeys: [], Keys: [] });
  }
  return JSON.stringify({ CtrlKeys: ctrlKeys, Keys: keys });
}

/** Human label aligned with Quicker KeyboardHelper.GetKeysName. */
export function formatKeyInputKeysName(data: KeyInputStepData): string {
  const ctrlKeys = data.ctrlKeys ?? [];
  const keys = data.keys ?? [];
  if (ctrlKeys.length === 0 && keys.length === 0) {
    return "<未设置>";
  }
  if (ctrlKeys.length > 0) {
    const mods = ctrlKeys.map(formatVkName).join("+");
    const body = keys.map(formatVkName).join(",");
    return `${mods}+ [ ${body} ]`;
  }
  return keys.map(formatVkName).join(",");
}

export function describeKeyInputWire(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "<未设置>";
  if (!isKeyInputWireJson(text)) return text;
  return formatKeyInputKeysName(parseKeyInputStepData(text));
}

export type BuildKeyInputWireOptions = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  win?: boolean;
  /** Key names: C, Enter, F1, LeftCtrl, or numeric VK like 65 / #65 */
  keys: string[];
};

/**
 * Build wire JSON for agents authoring sys:keyInput.
 * Modifiers use generic VK (Ctrl=17, Alt=18, Shift=16, Win=91) like KeySelectorWindow.
 */
export function buildKeyInputWire(opts: BuildKeyInputWireOptions): string {
  const ctrlKeys: number[] = [];
  if (opts.ctrl) ctrlKeys.push(VK.CONTROL);
  if (opts.alt) ctrlKeys.push(VK.MENU);
  if (opts.shift) ctrlKeys.push(VK.SHIFT);
  if (opts.win) ctrlKeys.push(VK.LWIN);

  const keys: number[] = [];
  for (const name of opts.keys) {
    const vk = vkFromKeyName(name);
    if (vk == null) {
      throw new Error(`Unknown key name: ${name}`);
    }
    if (isModifierVk(vk)) {
      if (!ctrlKeys.includes(vk)) ctrlKeys.push(vk);
    } else if (!keys.includes(vk)) {
      keys.push(vk);
    }
  }

  return serializeKeyInputStepData({ ctrlKeys, keys });
}

/** Agent cheat-sheet row: chord label → wire JSON string (unescaped). */
export const KEY_INPUT_WIRE_EXAMPLES: ReadonlyArray<{ label: string; wire: string }> = [
  { label: "Ctrl+C", wire: buildKeyInputWire({ ctrl: true, keys: ["C"] }) },
  { label: "Ctrl+V", wire: buildKeyInputWire({ ctrl: true, keys: ["V"] }) },
  { label: "Ctrl+Shift+S", wire: buildKeyInputWire({ ctrl: true, shift: true, keys: ["S"] }) },
  { label: "Win+Shift+S", wire: buildKeyInputWire({ win: true, shift: true, keys: ["S"] }) },
  { label: "Enter", wire: buildKeyInputWire({ keys: ["Enter"] }) },
  { label: "Down", wire: buildKeyInputWire({ keys: ["Down"] }) },
];
