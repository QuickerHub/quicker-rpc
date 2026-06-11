/** In-page scripts for embedded WebContents automation (no Playwright). */

export const COLLECT_INTERACTIVE_NODES = `
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
      const node = { role, name: accName(root) || null };
      if (tag === "A" && typeof root.href === "string" && root.href.trim()) {
        node.href = root.href.trim().slice(0, 200);
      }
      out.push(node);
    }
    for (const child of root.children) walk(child, out);
  }

  const out = [];
  walk(document.body, out);
  return out.slice(0, 200);
}
`;

export const EXTRACT_PAGE_CONTENT = `
({ selector }) => {
  const clean = (raw) => raw.replace(/[ \\t]+/g, " ").replace(/\\n{3,}/g, "\\n\\n").trim();
  if (selector) {
    const matches = Array.from(document.querySelectorAll(selector));
    return {
      text: clean(
        matches
          .map((el) => el.innerText ?? el.textContent ?? "")
          .join("\\n\\n"),
      ),
      matchCount: matches.length,
    };
  }
  return { text: clean(document.body?.innerText ?? ""), matchCount: null };
}
`;

export const REF_INTERACTION_SCRIPT = `
({ target, action, text, value, key }) => {
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
    if (labelled && labelled.trim()) return labelled.trim();
    const t = (el.innerText || el.textContent || "").trim();
    return t || "";
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function matchesTarget(el, t) {
    if (!el || el.nodeType !== 1 || !isVisible(el)) return false;
    const role = resolveRole(el);
    if (!role || role !== t.role) return false;
    if (t.href) {
      if (el.tagName !== "A") return false;
      const href = typeof el.href === "string" ? el.href.trim() : "";
      if (href !== t.href.trim()) return false;
    }
    if (t.name) {
      const name = accName(el);
      if (!name || !name.includes(t.name) && t.name !== name) return false;
    }
    return true;
  }

  function collectMatches(t) {
    const out = [];
    const walk = (root) => {
      if (!root || root.nodeType !== 1) return;
      if (matchesTarget(root, t)) out.push(root);
      for (const child of root.children) walk(child);
    };
    walk(document.body);
    return out;
  }

  const matches = collectMatches(target);
  const nth = Number.isFinite(target.nth) ? target.nth : 0;
  const el = matches[nth] ?? matches[0];
  if (!el) throw new Error("element not found for ref");

  if (action === "click") {
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
    return { clicked: true };
  }
  if (action === "type") {
    el.focus();
    if ("value" in el) el.value = (el.value || "") + String(text ?? "");
    else el.textContent = (el.textContent || "") + String(text ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { typedLength: String(text ?? "").length };
  }
  if (action === "fill") {
    el.focus();
    if ("value" in el) el.value = String(value ?? "");
    else el.textContent = String(value ?? "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { filled: true };
  }
  if (action === "press") {
    el.focus();
    const k = String(key ?? "");
    const opts = { key: k, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
    if (k === "Enter" && el.form) {
      try { el.form.requestSubmit(); } catch { el.form.submit(); }
    }
    return { key: k };
  }
  if (action === "scroll") {
    el.scrollIntoView({ block: "center", inline: "center" });
    return { scrolled: true };
  }
  if (action === "wait") {
    return { visible: true };
  }
  throw new Error("unknown ref action: " + action);
}
`;

export const CLICK_AT_POINT_SCRIPT = `
({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  if (!el || el.nodeType !== 1) throw new Error("no element at point");
  el.scrollIntoView({ block: "center", inline: "center" });
  el.click();
  return { clicked: true, tagName: el.tagName.toLowerCase() };
}
`;

export const SCROLL_PAGE_SCRIPT = `
({ deltaX, deltaY }) => {
  window.scrollBy(deltaX || 0, deltaY || 600);
  return { scrolled: true };
}
`;

export const WAIT_FOR_TEXT_SCRIPT = `
({ text, timeoutMs }) => {
  const needle = String(text ?? "").trim();
  if (!needle) return { waited: true };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const body = document.body?.innerText ?? "";
    if (body.includes(needle)) return { waited: true, found: true };
  }
  throw new Error("timeout waiting for text");
}
`;
