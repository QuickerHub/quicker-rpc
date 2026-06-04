/**
 * Sidebar title length by approximate display width (not raw char count).
 * CJK ≈ 2 units, Latin/digits ≈ 1 — ~36 units ≈ 18 Han chars or ~6 English words.
 */

export const MAX_SIDEBAR_TITLE_DISPLAY_UNITS = 36;
export const MIN_SIDEBAR_TITLE_DISPLAY_UNITS = 4;

/** Shown in LLM prompts (not a hard char cap). */
export const SIDEBAR_TITLE_LENGTH_HINT =
  "about 18 Chinese characters or about 6 English words";

const WIDE_SCRIPT_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function titleCharDisplayUnits(char: string): number {
  if (!char) return 0;
  if (/\s/.test(char)) return 0.5;
  if (WIDE_SCRIPT_RE.test(char)) return 2;
  return 1;
}

export function measureTitleDisplayUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    units += titleCharDisplayUnits(char);
  }
  return units;
}

export function isTitleWithinSidebarLimit(text: string): boolean {
  const units = measureTitleDisplayUnits(text.trim());
  return units >= MIN_SIDEBAR_TITLE_DISPLAY_UNITS
    && units <= MAX_SIDEBAR_TITLE_DISPLAY_UNITS;
}

export function truncateTitleToDisplayUnits(
  text: string,
  maxUnits = MAX_SIDEBAR_TITLE_DISPLAY_UNITS,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  let units = 0;
  let out = "";
  for (const char of normalized) {
    const w = titleCharDisplayUnits(char);
    if (units + w > maxUnits) {
      return out ? `${out}…` : "…";
    }
    units += w;
    out += char;
  }
  return out;
}
