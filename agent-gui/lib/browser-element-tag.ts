import type { BrowserPickElementContext } from "@/lib/browser-pick-element-prompt";
import { formatBrowserPickElementPrompt } from "@/lib/browser-pick-element-prompt";
import { parseHtmlAttrs } from "@/lib/qka-markup";

export type BrowserElementTag = BrowserPickElementContext & {
  /** Stable chip id for composer DOM / dedupe. */
  tagId: string;
  /** Short label shown in the composer chip. */
  chipTitle: string;
};

const BROWSER_ELEMENT_TAG_RE = new RegExp(
  "<qkrpc-browser-element\\s+([^>]*?)\\s*(?:/>|></qkrpc-browser-element>)",
  "gi",
);

export const BROWSER_ELEMENT_TAG_CLASS = "composer-prompt-tag--browser-element";
export const BROWSER_ELEMENT_TAG_ATTR = "data-browser-tag-id";

function escapeAttrValue(value: string): string {
  // `>` must be escaped too: raw `>` inside attr values (e.g. outerHtml)
  // would terminate the `[^>]*` markup-attr regex early.
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readAttr(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key]?.trim();
  return value || undefined;
}

function readNumberAttr(attrs: Record<string, string>, key: string): number | null {
  const raw = attrs[key]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Short label for composer chip and sent-message bubble. */
export function browserElementDisplayTitle(
  ctx: BrowserPickElementContext,
): string {
  const name = ctx.refName?.trim();
  if (name) {
    const role = ctx.refRole?.trim();
    return role ? `${role} "${name}"` : name;
  }
  const text = ctx.text?.trim();
  if (text) {
    return text.length > 40 ? `${text.slice(0, 37)}…` : text;
  }
  const tag = ctx.tagName?.trim()?.toLowerCase();
  const id = ctx.elementId?.trim();
  if (tag && id) return `${tag}#${id}`;
  const component = ctx.reactComponent?.trim();
  if (component && tag) return `<${tag}> (${component})`;
  if (tag) return tag;
  if (ctx.ref?.trim()) return `ref=${ctx.ref.trim()}`;
  return ctx.title?.trim() || "页面元素";
}

export function createBrowserElementTag(
  ctx: BrowserPickElementContext,
  tagId = `be-${Date.now().toString(36)}`,
): BrowserElementTag {
  return {
    ...ctx,
    tagId,
    chipTitle: browserElementDisplayTitle(ctx),
  };
}

export function formatBrowserElementTagMarkup(tag: BrowserElementTag): string {
  const attrs = [
    `${BROWSER_ELEMENT_TAG_ATTR}="${escapeAttrValue(tag.tagId)}"`,
    `data-browser-title="${escapeAttrValue(tag.chipTitle)}"`,
    `data-browser-url="${escapeAttrValue(tag.url)}"`,
    `data-browser-pick-x="${tag.pickX}"`,
    `data-browser-pick-y="${tag.pickY}"`,
  ];

  const optional: Array<[string, string | null | undefined]> = [
    ["data-browser-page-title", tag.title ?? null],
    ["data-browser-ref", tag.ref],
    ["data-browser-ref-role", tag.refRole],
    ["data-browser-ref-name", tag.refName],
    ["data-browser-tag", tag.tagName],
    ["data-browser-text", tag.text],
    ["data-browser-id", tag.elementId],
    ["data-browser-class", tag.className],
    ["data-browser-href", tag.href],
    ["data-browser-value", tag.value],
    ["data-browser-snapshot-line", tag.snapshotLine],
    ["data-browser-session-id", tag.sessionId],
    ["data-browser-dom-path", tag.domPath],
    ["data-browser-react-component", tag.reactComponent],
    ["data-browser-outer-html", tag.outerHtml],
  ];

  for (const [key, value] of optional) {
    const trimmed = value?.trim();
    if (trimmed) attrs.push(`${key}="${escapeAttrValue(trimmed)}"`);
  }

  if (
    tag.rectTop != null
    && tag.rectLeft != null
    && tag.rectWidth != null
    && tag.rectHeight != null
  ) {
    attrs.push(
      `data-browser-rect="${tag.rectTop},${tag.rectLeft},${tag.rectWidth},${tag.rectHeight}"`,
    );
  }

  return `<qkrpc-browser-element ${attrs.join(" ")}></qkrpc-browser-element>`;
}

export function isBrowserElementTagElement(el: Element): boolean {
  return (
    el instanceof HTMLElement
    && el.classList.contains("composer-prompt-tag")
    && el.classList.contains(BROWSER_ELEMENT_TAG_CLASS)
    && el.hasAttribute(BROWSER_ELEMENT_TAG_ATTR)
  );
}

export function browserElementTagFromDom(el: HTMLElement): BrowserElementTag | null {
  if (!isBrowserElementTagElement(el)) return null;
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value;
  }
  return browserElementTagFromAttrs(attrs);
}

export function browserElementTagFromAttrs(
  attrs: Record<string, string>,
): BrowserElementTag | null {
  const tagId = readAttr(attrs, BROWSER_ELEMENT_TAG_ATTR);
  const url = readAttr(attrs, "data-browser-url");
  const pickX = readNumberAttr(attrs, "data-browser-pick-x");
  const pickY = readNumberAttr(attrs, "data-browser-pick-y");
  if (!tagId || !url || pickX == null || pickY == null) return null;

  const rectRaw = readAttr(attrs, "data-browser-rect");
  const rectParts = rectRaw
    ? rectRaw.split(",").map((part) => Number(part.trim()))
    : [];
  const rectValid =
    rectParts.length === 4 && rectParts.every((n) => Number.isFinite(n));

  const ctx: BrowserPickElementContext = {
    url,
    pickX,
    pickY,
    title: readAttr(attrs, "data-browser-page-title"),
    ref: readAttr(attrs, "data-browser-ref"),
    refRole: readAttr(attrs, "data-browser-ref-role"),
    refName: readAttr(attrs, "data-browser-ref-name"),
    tagName: readAttr(attrs, "data-browser-tag"),
    text: readAttr(attrs, "data-browser-text"),
    elementId: readAttr(attrs, "data-browser-id"),
    className: readAttr(attrs, "data-browser-class"),
    href: readAttr(attrs, "data-browser-href"),
    value: readAttr(attrs, "data-browser-value"),
    snapshotLine: readAttr(attrs, "data-browser-snapshot-line"),
    sessionId: readAttr(attrs, "data-browser-session-id"),
    domPath: readAttr(attrs, "data-browser-dom-path"),
    reactComponent: readAttr(attrs, "data-browser-react-component"),
    outerHtml: readAttr(attrs, "data-browser-outer-html"),
    rectTop: rectValid ? rectParts[0]! : null,
    rectLeft: rectValid ? rectParts[1]! : null,
    rectWidth: rectValid ? rectParts[2]! : null,
    rectHeight: rectValid ? rectParts[3]! : null,
  };

  return {
    ...ctx,
    tagId,
    chipTitle:
      readAttr(attrs, "data-browser-title") ?? browserElementDisplayTitle(ctx),
  };
}

export function expandBrowserElementTagForModel(tag: BrowserElementTag): string {
  return formatBrowserPickElementPrompt(tag);
}

export function findBrowserElementTagMarkupHits(text: string): Array<{
  index: number;
  length: number;
  element: BrowserElementTag;
}> {
  const hits: Array<{
    index: number;
    length: number;
    element: BrowserElementTag;
  }> = [];
  const re = new RegExp(BROWSER_ELEMENT_TAG_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const element = browserElementTagFromAttrs(parseHtmlAttrs(match[1]));
    if (!element) continue;
    hits.push({
      index: match.index,
      length: match[0].length,
      element,
    });
  }
  return hits;
}
