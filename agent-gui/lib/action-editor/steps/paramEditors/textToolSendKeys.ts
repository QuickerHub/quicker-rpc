/** Minimal SendKeys token map aligned with Quicker KeySelectTool.GetSendkeysKeyName. */
const SEND_KEYS_SPECIAL: Record<string, string> = {
  Backspace: "{BS}",
  Delete: "{DEL}",
  Enter: "{ENTER}",
  Escape: "{ESC}",
  Tab: "{TAB}",
  " ": " ",
  ArrowUp: "{UP}",
  ArrowDown: "{DOWN}",
  ArrowLeft: "{LEFT}",
  ArrowRight: "{RIGHT}",
  Home: "{HOME}",
  End: "{END}",
  PageUp: "{PGUP}",
  PageDown: "{PGDN}",
  Insert: "{INSERT}",
};

function modifierPrefix(event: KeyboardEvent): string {
  let prefix = "";
  if (event.ctrlKey) prefix += "^";
  if (event.shiftKey) prefix += "+";
  if (event.altKey) prefix += "%";
  return prefix;
}

function sendKeysBody(event: KeyboardEvent): string {
  const key = event.key;
  if (SEND_KEYS_SPECIAL[key]) {
    return SEND_KEYS_SPECIAL[key] ?? key;
  }
  if (key.length === 1) {
    return key.toLowerCase();
  }
  if (/^F\d{1,2}$/i.test(key)) {
    return `{${key.toUpperCase()}}`;
  }
  return key;
}

export type KeyCaptureMode = "keyName" | "keyCode" | "sendKeys";

/** Format one captured key chord for ParamTextTools insert. */
export function formatCapturedKey(event: KeyboardEvent, mode: KeyCaptureMode): string {
  if (mode === "keyCode") {
    const legacy = (event as KeyboardEvent & { keyCode?: number }).keyCode;
    if (typeof legacy === "number" && legacy > 0) {
      return String(legacy);
    }
    return "0";
  }

  if (mode === "sendKeys") {
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
      return "";
    }
    return `${modifierPrefix(event)}${sendKeysBody(event)}`;
  }

  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return "";
  }
  return event.key.length === 1 ? event.key : event.key;
}

export function keyCaptureModeForTool(toolId: string): KeyCaptureMode | null {
  switch (toolId) {
    case "SelectKeyName":
      return "keyName";
    case "SelectKeyCode":
      return "keyCode";
    case "SelectSendKeysData":
      return "sendKeys";
    default:
      return null;
  }
}
