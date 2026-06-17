/**
 * Windows Virtual-Key codes aligned with Quicker KeyboardHelper / WindowsInput.Native.
 * Used by sys:keyInput (KeyInputStepData) wire format.
 */

export const VK = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12,
  PAUSE: 0x13,
  CAPITAL: 0x14,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PRIOR: 0x21,
  NEXT: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  SNAPSHOT: 0x2c,
  INSERT: 0x2d,
  DELETE: 0x2e,
  LWIN: 0x5b,
  RWIN: 0x5c,
  NUMPAD0: 0x60,
  NUMPAD9: 0x69,
  F1: 0x70,
  F12: 0x7b,
  NUMLOCK: 0x90,
  SCROLL: 0x91,
  LSHIFT: 0xa0,
  RSHIFT: 0xa1,
  LCONTROL: 0xa2,
  RCONTROL: 0xa3,
  LMENU: 0xa4,
  RMENU: 0xa5,
  OEM_1: 0xba,
  OEM_PLUS: 0xbb,
  OEM_COMMA: 0xbc,
  OEM_MINUS: 0xbd,
  OEM_PERIOD: 0xbe,
  OEM_2: 0xbf,
  OEM_3: 0xc0,
  OEM_4: 0xdb,
  OEM_5: 0xdc,
  OEM_6: 0xdd,
  OEM_7: 0xde,
} as const;

/** Modifier VK codes (generic + left/right). */
export const MODIFIER_VK_CODES: ReadonlySet<number> = new Set([
  VK.CONTROL,
  VK.LCONTROL,
  VK.RCONTROL,
  VK.MENU,
  VK.LMENU,
  VK.RMENU,
  VK.SHIFT,
  VK.LSHIFT,
  VK.RSHIFT,
  VK.LWIN,
  VK.RWIN,
]);

export function isModifierVk(vk: number): boolean {
  return MODIFIER_VK_CODES.has(vk);
}

const DISPLAY_NAMES: Readonly<Record<number, string>> = {
  [VK.LEFT]: "←",
  [VK.RIGHT]: "→",
  [VK.UP]: "↑",
  [VK.DOWN]: "↓",
  [VK.ESCAPE]: "Esc",
  [VK.BACK]: "Backspace(退格)",
  [VK.TAB]: "Tab",
  [VK.RETURN]: "Return(回车)",
  [VK.SHIFT]: "Shift",
  [VK.CONTROL]: "Ctrl",
  [VK.MENU]: "Alt",
  [VK.PAUSE]: "Pause",
  [VK.CAPITAL]: "CapsLock",
  [VK.SPACE]: "Space",
  [VK.PRIOR]: "Page Up",
  [VK.NEXT]: "Page Down",
  [VK.END]: "End",
  [VK.HOME]: "Home",
  [VK.SNAPSHOT]: "Print Screen",
  [VK.INSERT]: "Insert",
  [VK.DELETE]: "Delete",
  [VK.NUMLOCK]: "Num Lock",
  [VK.SCROLL]: "Scroll Lock",
  [VK.LMENU]: "LeftAlt",
  [VK.RMENU]: "RightAlt",
  [VK.LCONTROL]: "LeftCtrl",
  [VK.RCONTROL]: "RightCtrl",
  [VK.LSHIFT]: "LeftShift",
  [VK.RSHIFT]: "RightShift",
  [VK.LWIN]: "LeftWin",
  [VK.RWIN]: "RightWin",
  [VK.OEM_1]: ";",
  [VK.OEM_PLUS]: "=",
  [VK.OEM_COMMA]: ",",
  [VK.OEM_MINUS]: "-",
  [VK.OEM_PERIOD]: ".",
  [VK.OEM_2]: "/",
  [VK.OEM_3]: "`",
  [VK.OEM_4]: "[",
  [VK.OEM_5]: "\\",
  [VK.OEM_6]: "]",
  [VK.OEM_7]: "'",
};

/** Map KeyboardEvent.code → Windows VK (recording). */
const CODE_TO_VK: Readonly<Record<string, number>> = {
  Backspace: VK.BACK,
  Tab: VK.TAB,
  Enter: VK.RETURN,
  NumpadEnter: 0x0e,
  ShiftLeft: VK.LSHIFT,
  ShiftRight: VK.RSHIFT,
  ControlLeft: VK.LCONTROL,
  ControlRight: VK.RCONTROL,
  AltLeft: VK.LMENU,
  AltRight: VK.RMENU,
  MetaLeft: VK.LWIN,
  MetaRight: VK.RWIN,
  Pause: VK.PAUSE,
  CapsLock: VK.CAPITAL,
  Escape: VK.ESCAPE,
  Space: VK.SPACE,
  PageUp: VK.PRIOR,
  PageDown: VK.NEXT,
  End: VK.END,
  Home: VK.HOME,
  ArrowLeft: VK.LEFT,
  ArrowUp: VK.UP,
  ArrowRight: VK.RIGHT,
  ArrowDown: VK.DOWN,
  PrintScreen: VK.SNAPSHOT,
  Insert: VK.INSERT,
  Delete: VK.DELETE,
  NumLock: VK.NUMLOCK,
  ScrollLock: VK.SCROLL,
  Semicolon: VK.OEM_1,
  Equal: VK.OEM_PLUS,
  Comma: VK.OEM_COMMA,
  Minus: VK.OEM_MINUS,
  Period: VK.OEM_PERIOD,
  Slash: VK.OEM_2,
  Backquote: VK.OEM_3,
  BracketLeft: VK.OEM_4,
  Backslash: VK.OEM_5,
  BracketRight: VK.OEM_6,
  Quote: VK.OEM_7,
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`Digit${i}`, 0x30 + i]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, 0x41 + i]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, VK.F1 + i]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`Numpad${i}`, VK.NUMPAD0 + i]),
  ),
};

const NAME_TO_VK: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {
    control: VK.CONTROL,
    ctrl: VK.CONTROL,
    lcontrol: VK.LCONTROL,
    leftctrl: VK.LCONTROL,
    rcontrol: VK.RCONTROL,
    rightctrl: VK.RCONTROL,
    shift: VK.SHIFT,
    lshift: VK.LSHIFT,
    leftshift: VK.LSHIFT,
    rshift: VK.RSHIFT,
    rightshift: VK.RSHIFT,
    alt: VK.MENU,
    menu: VK.MENU,
    lmenu: VK.LMENU,
    leftalt: VK.LMENU,
    rmenu: VK.RMENU,
    rightalt: VK.RMENU,
    win: VK.LWIN,
    lwin: VK.LWIN,
    leftwin: VK.LWIN,
    rwin: VK.RWIN,
    rightwin: VK.RWIN,
    escape: VK.ESCAPE,
    esc: VK.ESCAPE,
    enter: VK.RETURN,
    return: VK.RETURN,
    space: VK.SPACE,
    tab: VK.TAB,
    backspace: VK.BACK,
    delete: VK.DELETE,
    insert: VK.INSERT,
    home: VK.HOME,
    end: VK.END,
    pageup: VK.PRIOR,
    pagedown: VK.NEXT,
    left: VK.LEFT,
    right: VK.RIGHT,
    up: VK.UP,
    down: VK.DOWN,
    printscreen: VK.SNAPSHOT,
    capslock: VK.CAPITAL,
    numlock: VK.NUMLOCK,
    scrolllock: VK.SCROLL,
  };
  for (let i = 0; i < 26; i += 1) {
    const letter = String.fromCharCode(65 + i);
    map[letter.toLowerCase()] = 0x41 + i;
  }
  for (let i = 0; i <= 9; i += 1) {
    map[String(i)] = 0x30 + i;
  }
  for (let i = 1; i <= 12; i += 1) {
    map[`f${i}`] = VK.F1 + i - 1;
  }
  return map;
})();

/** Keys offered in the manual selector dropdown. */
export const SELECTOR_KEY_OPTIONS: ReadonlyArray<{ vk: number; label: string }> = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => ({
    vk: ch.charCodeAt(0),
    label: ch,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({ vk: 0x30 + i, label: String(i) })),
  ...Array.from({ length: 12 }, (_, i) => ({ vk: VK.F1 + i, label: `F${i + 1}` })),
  { vk: VK.RETURN, label: "Enter" },
  { vk: VK.ESCAPE, label: "Esc" },
  { vk: VK.TAB, label: "Tab" },
  { vk: VK.SPACE, label: "Space" },
  { vk: VK.BACK, label: "Backspace" },
  { vk: VK.DELETE, label: "Delete" },
  { vk: VK.INSERT, label: "Insert" },
  { vk: VK.HOME, label: "Home" },
  { vk: VK.END, label: "End" },
  { vk: VK.LEFT, label: "←" },
  { vk: VK.RIGHT, label: "→" },
  { vk: VK.UP, label: "↑" },
  { vk: VK.DOWN, label: "↓" },
  { vk: VK.PRIOR, label: "Page Up" },
  { vk: VK.NEXT, label: "Page Down" },
  { vk: VK.SNAPSHOT, label: "Print Screen" },
];

export function vkFromKeyboardCode(code: string): number | null {
  const vk = CODE_TO_VK[code];
  return typeof vk === "number" ? vk : null;
}

export function vkFromKeyName(name: string): number | null {
  const key = (name ?? "").trim();
  if (!key) return null;
  if (/^#?\d+$/.test(key)) {
    const n = Number.parseInt(key.replace(/^#/, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  const hit = NAME_TO_VK[key.toLowerCase()];
  return typeof hit === "number" ? hit : null;
}

export function formatVkName(vk: number): string {
  const custom = DISPLAY_NAMES[vk];
  if (custom) return custom;
  if (vk >= 0x41 && vk <= 0x5a) {
    return String.fromCharCode(vk);
  }
  if (vk >= 0x30 && vk <= 0x39) {
    return String.fromCharCode(vk);
  }
  if (vk >= VK.F1 && vk <= VK.F12) {
    return `F${vk - VK.F1 + 1}`;
  }
  if (vk >= VK.NUMPAD0 && vk <= VK.NUMPAD9) {
    return `Numpad ${vk - VK.NUMPAD0}`;
  }
  return `VK_${vk.toString(16).toUpperCase()}`;
}
