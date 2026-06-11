import type { SlashItemKind } from "@/lib/composer-slash-catalog";
import { slashItemLabel } from "@/lib/composer-slash-catalog";
import { parseHtmlAttrs } from "@/lib/qka-markup";

const COMPOSER_TAG_CLASS = "composer-prompt-tag";

export const SLASH_TAG_MARKUP = "qkrpc-slash-tag" as const;

export const SLASH_TAG_KIND_ATTR = "data-slash-kind";
export const SLASH_TAG_NAME_ATTR = "data-slash-name";

const SLASH_TAG_RE = new RegExp(
  `<${SLASH_TAG_MARKUP}\\s+([^>]*?)\\s*(?:/>|></${SLASH_TAG_MARKUP}>)`,
  "gi",
);

export type SlashTagRef = {
  kind: SlashItemKind;
  name: string;
};

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function slashTagFromAttrs(
  attrs: Record<string, string>,
): SlashTagRef | null {
  const kind = attrs["data-slash-kind"]?.trim();
  const name = attrs["data-slash-name"]?.trim();
  if (!name) return null;
  if (kind !== "command" && kind !== "skill" && kind !== "agent") return null;
  return { kind, name };
}

export function slashTagFromDom(el: HTMLElement): SlashTagRef | null {
  const kind = el.getAttribute(SLASH_TAG_KIND_ATTR)?.trim();
  const name = el.getAttribute(SLASH_TAG_NAME_ATTR)?.trim();
  if (!name) return null;
  if (kind !== "command" && kind !== "skill" && kind !== "agent") return null;
  return { kind, name };
}

export function isSlashTagElement(el: Element): boolean {
  return (
    el instanceof HTMLElement
    && el.classList.contains(COMPOSER_TAG_CLASS)
    && el.hasAttribute(SLASH_TAG_KIND_ATTR)
    && el.hasAttribute(SLASH_TAG_NAME_ATTR)
  );
}

export function formatSlashTagMarkup(ref: SlashTagRef): string {
  return (
    `<${SLASH_TAG_MARKUP} ${SLASH_TAG_KIND_ATTR}="${escapeAttrValue(ref.kind)}" `
    + `${SLASH_TAG_NAME_ATTR}="${escapeAttrValue(ref.name)}"></${SLASH_TAG_MARKUP}>`
  );
}

/** Wire text sent to slash-command expansion / model (no trailing space). */
export function expandSlashTagForWire(ref: SlashTagRef): string {
  switch (ref.kind) {
    case "command":
      return `/${ref.name}`;
    case "skill":
      return `请加载并遵循 skill「${ref.name}」：`;
    case "agent":
      return `请用 task 子代理「${ref.name}」：`;
  }
}

export function expandSlashTagsInUserText(text: string): string {
  if (!text.includes(`<${SLASH_TAG_MARKUP}`)) return text;
  return text.replace(SLASH_TAG_RE, (_full, attrStr: string) => {
    const ref = slashTagFromAttrs(parseHtmlAttrs(attrStr));
    if (!ref) return "";
    return expandSlashTagForWire(ref);
  });
}

function createSlashTagIcon(): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = "composer-prompt-tag__icon composer-prompt-tag__icon--slash";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "/";
  return icon;
}

export function createSlashTagElement(ref: SlashTagRef): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `${COMPOSER_TAG_CLASS} composer-prompt-tag--slash composer-prompt-tag--slash-${ref.kind}`;
  span.contentEditable = "false";
  span.setAttribute(SLASH_TAG_KIND_ATTR, ref.kind);
  span.setAttribute(SLASH_TAG_NAME_ATTR, ref.name);

  span.append(createSlashTagIcon());

  const title = document.createElement("span");
  title.className = "composer-prompt-tag__title";
  title.textContent = slashItemLabel({ ...ref, description: "", scope: "" });
  span.append(title);

  return span;
}
