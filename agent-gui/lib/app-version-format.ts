/** Strip leading v and git/build suffix (+hash). */
export function formatDisplayVersion(raw: string): string {
  const trimmed = raw.trim().replace(/^v/i, "");
  const base = trimmed.split("+")[0]?.trim();
  return base || trimmed;
}
