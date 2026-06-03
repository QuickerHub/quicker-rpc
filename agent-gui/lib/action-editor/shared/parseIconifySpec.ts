/**
 * Parse `iconify:` + full Iconify icon id (may contain one colon, e.g. mdi:shield-lock).
 */
export function parseIconifyIconId(spec: string | null | undefined): string | null {
  const t = spec?.trim() ?? "";
  const prefix = "iconify:";
  if (t.length < prefix.length + 3) {
    return null;
  }
  if (!t.toLowerCase().startsWith(prefix)) {
    return null;
  }
  const id = t.slice(prefix.length).trim();
  return id.length > 0 ? id : null;
}
