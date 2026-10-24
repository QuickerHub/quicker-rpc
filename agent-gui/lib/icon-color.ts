/** Convert an explicit Quicker/WPF hex token to CSS without changing its stored value. */
export function nativeIconHexToCss(raw: string): string | undefined {
  const token = raw.trim();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(token)) return undefined;
  const hex = token.slice(1).toUpperCase();
  if (hex.length === 3) return `#${[...hex].map((digit) => digit + digit).join("")}`;
  if (hex.length === 6) return `#${hex}`;
  const alpha = hex.slice(0, 2), rgb = hex.slice(2);
  return alpha === "FF" ? `#${rgb}` : `#${rgb}${alpha}`;
}
