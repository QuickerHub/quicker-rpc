from __future__ import annotations

from typing import Any

from playwright.async_api import Page, Locator

from quicker_browser_runtime.protocol import RefTarget

_COLLECT_SCRIPT = """
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
"""


async def collect_interactive_nodes(page: Page) -> list[dict[str, Any]]:
    result = await page.evaluate(_COLLECT_SCRIPT)
    if not isinstance(result, list):
        return []
    nodes: list[dict[str, Any]] = []
    for item in result:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if not role:
            continue
        name_raw = item.get("name")
        name = str(name_raw).strip() if name_raw else None
        nodes.append({"role": role, "name": name or None})
    return nodes


def resolve_locator(page: Page, target: RefTarget) -> Locator:
    if target.name:
        locator = page.get_by_role(target.role, name=target.name)
    else:
        locator = page.get_by_role(target.role)
    if target.nth > 0:
        locator = locator.nth(target.nth)
    return locator
