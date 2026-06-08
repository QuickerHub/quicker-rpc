/** @typedef {{ role: string; name: string | null; nth: number }} RefTarget */

/**
 * @param {string} url
 * @param {string} title
 * @param {Record<string, RefTarget>} refMap
 */
export function formatSnapshotYaml(url, title, refMap) {
  const lines = [`url: ${url}`, `title: ${title}`, "nodes:"];
  for (const [ref, target] of Object.entries(refMap)) {
    const namePart = target.name ? ` name="${target.name}"` : "";
    const nthPart = target.nth > 0 ? ` nth=${target.nth}` : "";
    const hrefPart =
      typeof target.href === "string" && target.href.trim()
        ? ` href=${target.href.trim()}`
        : "";
    lines.push(`  - role=${target.role}${namePart} ref=${ref}${nthPart}${hrefPart}`);
  }
  return lines.join("\n");
}

/** @param {string} message @param {{ code?: string }} [opts] */
export function invokeError(message, opts = {}) {
  return { ok: false, error: opts.code ?? "error", message };
}

/** @param {Record<string, unknown> | null | undefined} [data] */
export function invokeOk(data) {
  const payload = { ok: true };
  if (data != null) payload.data = data;
  return payload;
}
