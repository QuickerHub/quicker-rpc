// Adapted from Quicker.Headless/Web/src/features/shared at 574556d76b0b10bd9a8a7951277435649650fab8.
/**
 * Hex / HSV helpers for the icon color picker (no external color libs).
 */

export type HsvColor = { h: number; s: number; v: number };

/** Backend DefaultFill when an `fa:` spec has no color suffix. */
export const FA_DEFAULT_FILL = "#a0a0a0";

const HEX6 = /^#?([0-9a-f]{6})$/iu;
const HEX3 = /^#?([0-9a-f]{3})$/iu;
const HEX8 = /^#?([0-9a-f]{8})$/iu;

/** Normalize native hex tokens, retaining AARRGGBB; semantic tokens keep their spelling. */
export function normalizeColorToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  const asHex = tryParseHex(trimmed);
  return asHex ?? trimmed;
}

/** True when the spec uses theme/backend default (empty or the baked #A0A0A0 fill). */
export function isDefaultIconColor(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }
  const hex = tryParseHex(trimmed);
  return hex?.toLowerCase() === FA_DEFAULT_FILL || hex?.toLowerCase() === `#ff${FA_DEFAULT_FILL.slice(1)}`;
}

export function colorTokensEqual(a: string, b: string): boolean {
  if (isDefaultIconColor(a) && isDefaultIconColor(b)) {
    return true;
  }
  const na = normalizeColorToken(a);
  const nb = normalizeColorToken(b);
  const ha = tryParseHex(na);
  const hb = tryParseHex(nb);
  if (ha && hb) {
    const opaque = (value: string) => value.length === 7 ? `#FF${value.slice(1)}` : value;
    return opaque(ha) === opaque(hb);
  }
  return na.toLowerCase() === nb.toLowerCase();
}

/** Empty string for default; otherwise a canonical token (hex uppercased when parseable). */
export function canonicalIconPickerColor(token: string): string {
  if (isDefaultIconColor(token)) {
    return "";
  }
  return normalizeColorToken(token);
}

export function tryParseHex(raw: string): string | null {
  const trimmed = raw.trim();
  const m8 = HEX8.exec(trimmed);
  if (m8) {
    // Keep native storage and CSS presentation separate; repeated edits must not rotate ARGB bytes.
    return `#${m8[1]!.toUpperCase()}`;
  }
  const m6 = HEX6.exec(trimmed);
  if (m6) {
    return `#${m6[1]!.toUpperCase()}`;
  }
  const m3 = HEX3.exec(trimmed);
  if (m3) {
    const s = m3[1]!;
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = tryParseHex(hex);
  if (!normalized) {
    return null;
  }
  const n = Number.parseInt(normalized.length === 9 ? normalized.slice(3) : normalized.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d) % 6;
    } else if (max === gn) {
      h = (bn - rn) / d + 2;
    } else {
      h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

export function hexToHsv(hex: string): HsvColor | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb.r, rgb.g, rgb.b) : null;
}

export function hsvToHex(hsv: HsvColor): string {
  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Near-black fills vanish on dark chrome; near-white fills vanish on light chrome.
 * Keep saturated brand colors (SolidWorks red, Blender orange) unchanged.
 */
export function contrastIconFill(token: string, theme: "dark" | "light"): string {
  const hex = tryParseHex(token);
  if (!hex) {
    return token;
  }
  const hsv = hexToHsv(hex);
  if (!hsv) {
    return hex;
  }
  if (theme === "dark" && hsv.v < 0.22) {
    const s = hsv.s < 0.08 ? 0 : Math.min(hsv.s, 0.28);
    return hsvToHex({ h: hsv.h, s, v: 0.78 });
  }
  if (theme === "light" && hsv.v > 0.92 && hsv.s < 0.12) {
    return hsvToHex({ h: hsv.h, s: hsv.s, v: 0.42 });
  }
  return cssPreviewColor(hex)!;
}

export function cssPreviewColor(token: string): string | undefined {
  const hex = tryParseHex(token);
  if (hex) {
    // WPF persists AARRGGBB. CSS conversion is performed exactly once at this display boundary.
    if (hex.length === 9) return hex.slice(1, 3) === "FF" ? `#${hex.slice(3)}` : `#${hex.slice(3)}${hex.slice(1, 3)}`;
    return hex;
  }
  const semantic: Record<string, string> = {
    success: "#22c55e",
    warning: "#eab308",
    danger: "#ef4444",
    error: "#ef4444",
    info: "#3b82f6",
    text: "#737373",
    link: "#2563eb",
    primary: "#171717",
    secondary: "#a3a3a3",
  };
  return semantic[token.trim().toLowerCase()];
}
