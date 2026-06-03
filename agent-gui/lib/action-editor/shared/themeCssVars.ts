/** Read a CSS custom property from the document root (theme-aware). */
export function readThemeCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") {
    return fallback;
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Styles for HTML5 drag image preview (not inheriting CSS from app tree). */
export function dragGhostInlineColors(): { border: string; background: string; color: string } {
  const accent = readThemeCssVar("--ad-accent", "#4f9bd8");
  const bg = readThemeCssVar("--ad-bg-selected-row", "#2f3943");
  const fg = readThemeCssVar("--ad-drag-preview-fg", "#dfeaf6");
  return {
    border: `1px solid ${accent}`,
    background: bg,
    color: fg,
  };
}
