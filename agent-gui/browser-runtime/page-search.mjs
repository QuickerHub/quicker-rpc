import { buildRefMapFromNodes } from "./page-structure.mjs";

/** Walk visible elements and collect searchable text targets. */
export const COLLECT_SEARCH_CANDIDATES = `
() => {
  const TAG_ROLE = {
    A: "link",
    BUTTON: "button",
    INPUT: null,
    TEXTAREA: "textbox",
    SELECT: "combobox",
    SUMMARY: "button",
    TH: "columnheader",
    TD: "cell",
    CAPTION: "caption",
    LABEL: "label",
  };

  function inputRole(el) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "textbox";
  }

  function resolveRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === "INPUT") return inputRole(el);
    return TAG_ROLE[tag] || null;
  }

  function accName(el) {
    const labelled = el.getAttribute("aria-label")
      || el.getAttribute("placeholder")
      || el.getAttribute("title")
      || el.getAttribute("name")
      || el.getAttribute("value");
    if (labelled && labelled.trim()) return labelled.trim().slice(0, 160);
    return null;
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function directText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) out += node.textContent || "";
    }
    return out.replace(/\\s+/g, " ").trim();
  }

  function pickText(el) {
    const direct = directText(el);
    if (direct.length >= 1 && direct.length <= 160) return direct;
    const full = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
    if (!full) return "";
    return full.length <= 160 ? full : full.slice(0, 160);
  }

  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH"]);
  const out = [];
  const seen = new Set();

  function walk(el) {
    if (!el || el.nodeType !== 1 || SKIP.has(el.tagName)) return;
    if (!isVisible(el)) return;

    const tag = el.tagName;
    const role = resolveRole(el) || tag.toLowerCase();
    const text = pickText(el);
    const name = accName(el);
    const href =
      tag === "A" && typeof el.href === "string" && el.href.trim()
        ? el.href.trim().slice(0, 200)
        : undefined;

    if (text || name) {
      const key = role + "\\0" + (name || "") + "\\0" + text + "\\0" + (href || "");
      if (!seen.has(key)) {
        seen.add(key);
        out.push({
          role,
          tag: tag.toLowerCase(),
          name: name || null,
          text: text || name || "",
          ...(href ? { href } : {}),
        });
      }
    }

    for (const child of el.children) walk(child);
    if (out.length >= 1200) return;
  }

  walk(document.body);
  return out.slice(0, 1200);
}
`;

const HEADER_ROLES = new Set(["columnheader", "rowheader", "caption", "label", "heading"]);

/**
 * @param {string} query
 * @param {{ text?: string; name?: string | null; role?: string; tag?: string }} candidate
 */
export function scoreTextMatch(query, candidate) {
  const q = String(query ?? "").trim();
  if (!q) return 0;

  /** @type {string[]} */
  const fields = [];
  if (candidate.text) fields.push(String(candidate.text).trim());
  if (candidate.name) fields.push(String(candidate.name).trim());

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (field === q) {
      best = Math.max(best, 1000);
      continue;
    }
    if (field.includes(q)) {
      let score = 700 - Math.min(field.length, 280);
      if (field.length <= q.length * 2) score += 120;
      if (HEADER_ROLES.has(String(candidate.role ?? ""))) score += 180;
      if (candidate.tag === "th") score += 180;
      best = Math.max(best, score);
      continue;
    }
    // Ordered subsequence match (helps minor spacing differences)
    let qi = 0;
    for (const ch of field) {
      if (ch === q[qi]) qi += 1;
      if (qi >= q.length) break;
    }
    if (qi === q.length) {
      best = Math.max(best, 320 - Math.min(field.length, 200));
    }
  }
  return best;
}

/**
 * @param {string} query
 * @param {Array<{ role?: string; name?: string | null; text?: string; href?: string; tag?: string }>} candidates
 * @param {number} [limit]
 */
export function rankSearchCandidates(query, candidates, limit = 8) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((candidate) => ({
      ...candidate,
      role: String(candidate.role ?? "generic"),
      text: String(candidate.text ?? candidate.name ?? "").trim(),
      name: candidate.name != null ? String(candidate.name).trim() || null : null,
      score: scoreTextMatch(query, candidate),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, Math.max(1, limit));
}

/**
 * Assign refs for search hits; merges into existing refMap.
 * @param {Array<{ role: string; name: string | null; text: string; href?: string; tag?: string; score: number }>} matches
 * @param {Record<string, { role: string; name: string | null; nth: number; href?: string }>} existingRefMap
 */
export function assignRefsToSearchMatches(matches, existingRefMap = {}) {
  /** @type {Record<string, { role: string; name: string | null; nth: number; href?: string }>} */
  const refMap = { ...existingRefMap };
  /** @type {Record<string, number>} */
  const roleCounts = {};
  for (const target of Object.values(refMap)) {
    const key = `${target.role}\0${target.name ?? ""}\0${target.href ?? ""}`;
    roleCounts[key] = (roleCounts[key] ?? 0) + 1;
  }

  /** @type {Array<Record<string, unknown>>} */
  const enriched = [];
  for (const match of matches) {
    const name = match.name ?? (match.text || null);
    const key = `${match.role}\0${name ?? ""}\0${match.href ?? ""}`;
    let ref = Object.entries(refMap).find(([, target]) => {
      return (
        target.role === match.role
        && (target.name ?? "") === (name ?? "")
        && (target.href ?? "") === (match.href ?? "")
      );
    })?.[0];

    if (!ref) {
      const nth = roleCounts[key] ?? 0;
      roleCounts[key] = nth + 1;
      ref = `e${Object.keys(refMap).length + 1}`;
      refMap[ref] = {
        role: match.role,
        name,
        nth,
        ...(match.href ? { href: match.href } : {}),
      };
    }

    enriched.push({
      ref,
      role: match.role,
      tag: match.tag ?? null,
      name,
      text: match.text,
      ...(match.href ? { href: match.href } : {}),
      score: match.score,
    });
  }

  return { refMap, matches: enriched };
}

/**
 * @param {string} query
 * @param {unknown} rawCandidates
 * @param {Record<string, { role: string; name: string | null; nth: number; href?: string }>} [existingRefMap]
 * @param {number} [limit]
 */
export function buildPageSearchResult(query, rawCandidates, existingRefMap = {}, limit = 8) {
  const ranked = rankSearchCandidates(query, rawCandidates, limit);
  const { refMap, matches } = assignRefsToSearchMatches(ranked, existingRefMap);
  return {
    query,
    matchCount: matches.length,
    matches,
    refMap,
  };
}

/** @param {import('playwright').Page} page */
export async function collectSearchCandidates(page) {
  const raw = await page.evaluate(`(${COLLECT_SEARCH_CANDIDATES})()`);
  return Array.isArray(raw) ? raw : [];
}

/** @param {Array<{ role?: string; name?: string | null; href?: string }>} nodes */
export function refMapFromSearchNodes(nodes) {
  return buildRefMapFromNodes(nodes);
}
