import type { RefTargetHint } from "@/lib/browser-to-action/types";

/** Parse browser snapshot YAML (`nodes:` section) into ref → target map. */
export function parseSnapshotRefMap(snapshot: string): Map<string, RefTargetHint> {
  const map = new Map<string, RefTargetHint>();
  if (!snapshot.trim()) return map;

  const lineRe =
    /^\s*-\s+role=([^\s]+)(?:\s+name="([^"]*)")?(?:\s+ref=(\S+))?(?:\s+nth=(\d+))?/;
  const altRe =
    /^\s*-\s+role=([^\s]+)(?:\s+name="([^"]*)")?(?:\s+nth=(\d+))?\s*$/;

  for (const line of snapshot.split("\n")) {
    let match = lineRe.exec(line);
    let ref: string | undefined;
    let role: string | undefined;
    let name: string | undefined;
    let nth = 0;

    if (match) {
      role = match[1];
      name = match[2];
      ref = match[3];
      nth = match[4] ? Number(match[4]) : 0;
    } else {
      match = altRe.exec(line);
      if (!match) continue;
      role = match[1];
      name = match[2];
      nth = match[3] ? Number(match[3]) : 0;
      const refMatch = /ref=(\S+)/.exec(line);
      ref = refMatch?.[1];
    }

    if (!role) continue;
    const refKey = ref ?? `e${map.size + 1}`;
    map.set(refKey, {
      role,
      name: name?.trim() ? name.trim() : null,
      nth: Number.isFinite(nth) ? nth : 0,
    });
  }

  return map;
}

/** Read ref targets from browser search matches in tool output. */
export function refTargetFromSearchMatches(
  matches: unknown,
  ref: string,
): RefTargetHint | undefined {
  if (!Array.isArray(matches)) return undefined;
  for (const item of matches) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (row.ref !== ref) continue;
    const role = typeof row.role === "string" ? row.role : "generic";
    const name =
      typeof row.name === "string"
        ? row.name
        : typeof row.text === "string"
          ? row.text
          : null;
    const nth = typeof row.nth === "number" ? row.nth : 0;
    return { role, name, nth };
  }
  return undefined;
}
