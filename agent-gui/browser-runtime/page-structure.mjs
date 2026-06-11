import { formatSnapshotYaml } from "./protocol.mjs";
import { countInteractiveRefs } from "./snapshot.mjs";

/** In-page collector for headings, links, landmarks — quick structural scan for agents. */
export const COLLECT_PAGE_OUTLINE = `
() => {
  function clip(raw, max = 120) {
    const t = String(raw ?? "").trim();
    return t.length > max ? t.slice(0, max) : t;
  }
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  const headings = [];
  for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
    if (!isVisible(el)) continue;
    const level = Number(el.tagName.slice(1));
    const text = clip(el.innerText || el.textContent || "");
    if (!text) continue;
    headings.push({ level, text });
    if (headings.length >= 30) break;
  }

  const links = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (!isVisible(a)) continue;
    const text = clip(
      a.innerText || a.textContent || a.getAttribute("aria-label") || "",
      80,
    );
    const href = typeof a.href === "string" ? a.href.trim().slice(0, 200) : "";
    if (!href) continue;
    links.push({ text: text || href, href });
    if (links.length >= 40) break;
  }

  const landmarks = [];
  for (const tag of ["main", "nav", "article", "aside", "header", "footer"]) {
    for (const el of document.querySelectorAll(tag)) {
      if (!isVisible(el)) continue;
      landmarks.push({ role: tag, text: clip(el.innerText || el.textContent || "", 80) });
      if (landmarks.length >= 12) break;
    }
    if (landmarks.length >= 12) break;
  }

  /** @type {Record<string, string>} */
  const meta = {};
  const desc = document.querySelector('meta[name="description"]');
  if (desc) meta.description = clip(desc.getAttribute("content") || "", 200);
  const og = document.querySelector('meta[property="og:title"]');
  if (og) meta.ogTitle = clip(og.getAttribute("content") || "", 120);

  return { headings, links, landmarks, meta };
}
`;

/**
 * @param {Array<{ role?: string; name?: string | null; href?: string }>} nodes
 * @returns {Record<string, { role: string; name: string | null; nth: number; href?: string }>}
 */
export function buildRefMapFromNodes(nodes) {
  /** @type {Record<string, { role: string; name: string | null; nth: number; href?: string }>} */
  const refMap = {};
  /** @type {Record<string, number>} */
  const roleCounts = {};
  if (!Array.isArray(nodes)) return refMap;

  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const role = String(node.role ?? "").trim();
    if (!role) continue;
    const nameRaw = node.name;
    const name = nameRaw != null ? String(nameRaw).trim() || null : null;
    const hrefRaw = node.href;
    const href =
      hrefRaw != null && String(hrefRaw).trim() ? String(hrefRaw).trim() : undefined;
    const key = `${role}\0${name ?? ""}\0${href ?? ""}`;
    const nth = roleCounts[key] ?? 0;
    roleCounts[key] = nth + 1;
    const ref = `e${Object.keys(refMap).length + 1}`;
    refMap[ref] = { role, name, nth, ...(href ? { href } : {}) };
  }
  return refMap;
}

/**
 * @param {string} url
 * @param {string} title
 * @param {Array<{ role?: string; name?: string | null; href?: string }>} nodes
 */
export function buildInteractiveSnapshot(url, title, nodes) {
  const refMap = buildRefMapFromNodes(nodes);
  const snapshot = formatSnapshotYaml(url, title, refMap);
  return {
    refMap,
    snapshot,
    nodeCount: countInteractiveRefs(refMap) || Object.keys(refMap).length,
  };
}

/** @param {unknown} raw */
export function normalizePageOutline(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = /** @type {Record<string, unknown>} */ (raw);
  const pickItems = (value, max) => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => typeof item === "object" && item !== null)
      .slice(0, max);
  };
  const meta =
    typeof data.meta === "object" && data.meta !== null
      ? /** @type {Record<string, string>} */ (data.meta)
      : {};
  return {
    headings: pickItems(data.headings, 30),
    links: pickItems(data.links, 40),
    landmarks: pickItems(data.landmarks, 12),
    meta,
  };
}

/** @param {import('playwright').Page} page */
export async function collectPageOutline(page) {
  const raw = await page.evaluate(`(${COLLECT_PAGE_OUTLINE})()`);
  return normalizePageOutline(raw);
}
