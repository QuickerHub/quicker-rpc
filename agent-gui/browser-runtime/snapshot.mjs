/** @typedef {{ role: string; name: string | null; nth: number }} RefTarget */

const COLLECT_SCRIPT = `
() => {
  const TAG_ROLE = {
    A: "link",
    BUTTON: "button",
    INPUT: null,
    TEXTAREA: "textbox",
    SELECT: "combobox",
    SUMMARY: "button",
  };

  function inputRole(el) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "textbox";
  }

  function accName(el) {
    const labelled = el.getAttribute("aria-label")
      || el.getAttribute("placeholder")
      || el.getAttribute("title")
      || el.getAttribute("name")
      || el.getAttribute("value");
    if (labelled && labelled.trim()) return labelled.trim().slice(0, 120);
    const text = (el.innerText || el.textContent || "").trim();
    return text ? text.slice(0, 120) : "";
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function walk(root, out) {
    if (!root || root.nodeType !== 1) return;
    const tag = root.tagName;
    let role = root.getAttribute("role");
    if (!role) {
      if (tag === "INPUT") role = inputRole(root);
      else role = TAG_ROLE[tag] || null;
    }
    if (role && isVisible(root)) {
      out.push({ role, name: accName(root) || null });
    }
    for (const child of root.children) walk(child, out);
  }

  const out = [];
  walk(document.body, out);
  return out.slice(0, 200);
}
`;

/** @param {import('playwright').Page} page */
export async function collectInteractiveNodes(page) {
  const result = await page.evaluate(COLLECT_SCRIPT);
  if (!Array.isArray(result)) return [];
  /** @type {{ role: string; name: string | null }[]} */
  const nodes = [];
  for (const item of result) {
    if (!item || typeof item !== "object") continue;
    const role = String(/** @type {{ role?: unknown }} */ (item).role ?? "").trim();
    if (!role) continue;
    const nameRaw = /** @type {{ name?: unknown }} */ (item).name;
    const name = nameRaw != null ? String(nameRaw).trim() || null : null;
    nodes.push({ role, name });
  }
  return nodes;
}

/** @param {import('playwright').Page} page @param {RefTarget} target */
export function resolveLocator(page, target) {
  let locator = target.name
    ? page.getByRole(/** @type {import('playwright').AriaRole} */ (target.role), { name: target.name })
    : page.getByRole(/** @type {import('playwright').AriaRole} */ (target.role));
  if (target.nth > 0) locator = locator.nth(target.nth);
  return locator;
}
