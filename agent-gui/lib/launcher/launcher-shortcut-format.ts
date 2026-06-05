import type { ShellPlatform } from "@/lib/tauri-shell";

const MODIFIER_ONLY_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
]);

const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Enter: "Enter",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  ",": "Comma",
  ".": "Period",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  "/": "Slash",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
};

/** Map a keydown event to a Tauri global-shortcut string, or null if invalid. */
export function keyboardEventToTauriShortcut(event: KeyboardEvent): string | null {
  if (event.isComposing) return null;

  const keyToken = normalizeShortcutKey(event);
  if (!keyToken || MODIFIER_ONLY_KEYS.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  if (!event.ctrlKey && !event.metaKey && !event.altKey) return null;

  parts.push(keyToken);
  return parts.join("+");
}

function normalizeShortcutKey(event: KeyboardEvent): string | null {
  if (event.code.startsWith("Key") && event.code.length === 4) {
    return event.code.slice(3).toUpperCase();
  }
  if (event.code.startsWith("Digit") && event.code.length === 6) {
    return event.code.slice(5);
  }
  if (event.code.startsWith("F") && /^F\d+$/.test(event.code)) {
    return event.code;
  }
  if (KEY_ALIASES[event.key]) return KEY_ALIASES[event.key];
  if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
    return event.key.toUpperCase();
  }
  return null;
}

/** Human-readable label for settings UI. */
export function formatTauriShortcutDisplay(
  shortcut: string,
  platform: ShellPlatform = "windows",
): string {
  const modLabel = platform === "macos" ? "⌘" : "Ctrl";
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "CommandOrControl") return modLabel;
      if (part === "Shift") return "Shift";
      if (part === "Alt") return platform === "macos" ? "⌥" : "Alt";
      if (part === "Control") return "Ctrl";
      if (part === "Command") return "⌘";
      if (part === "Space") return "Space";
      return part;
    })
    .join("+");
}

const PRIMARY_MODIFIERS = new Set([
  "CommandOrControl",
  "Alt",
  "Control",
  "Command",
  "Super",
]);

export function isValidTauriShortcut(shortcut: string): boolean {
  const trimmed = shortcut.trim();
  if (!trimmed) return false;
  const parts = trimmed.split("+");
  if (parts.length < 2) return false;
  const key = parts[parts.length - 1];
  if (!key || MODIFIER_ONLY_KEYS.has(key)) return false;
  const modifiers = parts.slice(0, -1);
  if (!modifiers.some((part) => PRIMARY_MODIFIERS.has(part))) return false;
  return modifiers.every((part) =>
    [...PRIMARY_MODIFIERS, "Shift"].includes(part),
  );
}
