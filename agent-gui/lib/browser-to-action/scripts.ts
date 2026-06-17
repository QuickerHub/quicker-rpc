import type { RefTargetHint } from "@/lib/browser-to-action/types";

function jsString(value: string): string {
  return JSON.stringify(value);
}

/** IIFE script: find interactive element by role/name/nth (Playwright-like). */
export function buildFindElementScript(target: RefTargetHint): string {
  const role = jsString(target.role);
  const name =
    target.name != null && target.name.trim()
      ? jsString(target.name.trim())
      : "null";
  const nth = Number.isFinite(target.nth) ? Math.max(0, target.nth!) : 0;

  return `(() => {
  const role = ${role};
  const name = ${name};
  const nth = ${nth};
  const TAG_ROLE = { A: "link", BUTTON: "button", INPUT: null, TEXTAREA: "textbox", SELECT: "combobox" };
  function inputRole(el) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "textbox";
  }
  function accName(el) {
    return (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || el.getAttribute("value") || (el.innerText || el.textContent || "")).trim().slice(0, 160);
  }
  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? el : null;
  }
  const matches = [];
  function walk(root) {
    if (!root || root.nodeType !== 1) return;
    let r = root.getAttribute("role");
    if (!r) {
      if (root.tagName === "INPUT") r = inputRole(root);
      else r = TAG_ROLE[root.tagName] || null;
    }
    if (r === role) {
      const n = accName(root);
      if (name === null || n === name || (n && n.includes(name))) {
        const vis = isVisible(root);
        if (vis) matches.push(vis);
      }
    }
    for (const child of root.children) walk(child);
  }
  walk(document.body);
  return matches[nth] || matches[0] || null;
})()`;
}

export function buildClickScript(target: RefTargetHint): string {
  return `(() => { const el = ${buildFindElementScript(target)}; if (!el) throw new Error("element not found"); el.click(); return true; })()`;
}

export function buildFillScript(target: RefTargetHint, value: string): string {
  return `(() => { const el = ${buildFindElementScript(target)}; if (!el) throw new Error("element not found"); el.focus(); el.value = ${jsString(value)}; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
}

export function buildTypeScript(target: RefTargetHint, text: string): string {
  return `(() => { const el = ${buildFindElementScript(target)}; if (!el) throw new Error("element not found"); el.focus(); el.value = (el.value || "") + ${jsString(text)}; el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
}

export function buildPressScript(key: string, target?: RefTargetHint): string {
  const keyLit = jsString(key);
  if (!target) {
    return `(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: ${keyLit}, bubbles: true })); document.dispatchEvent(new KeyboardEvent("keyup", { key: ${keyLit}, bubbles: true })); return true; })()`;
  }
  return `(() => { const el = ${buildFindElementScript(target)}; if (!el) throw new Error("element not found"); el.focus(); el.dispatchEvent(new KeyboardEvent("keydown", { key: ${keyLit}, bubbles: true })); el.dispatchEvent(new KeyboardEvent("keyup", { key: ${keyLit}, bubbles: true })); return true; })()`;
}

export function buildContentScript(selector?: string): string {
  if (selector?.trim()) {
    return `(() => { const el = document.querySelector(${jsString(selector.trim())}); return el ? (el.innerText || el.textContent || "").trim() : ""; })()`;
  }
  return `(() => (document.body.innerText || document.body.textContent || "").trim())()`;
}

export function wrapUserScript(script: string): string {
  const body = script.trim();
  if (!body) return "() => null";
  if (body.startsWith("(") || body.startsWith("function") || body.startsWith("async")) {
    return body;
  }
  return `(() => { ${body} })()`;
}
