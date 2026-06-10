import type { PinnedAction } from "@/lib/action-context";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import {
  BROWSER_ELEMENT_TAG_ATTR,
  BROWSER_ELEMENT_TAG_CLASS,
  browserElementTagFromDom,
  formatBrowserElementTagMarkup,
  isBrowserElementTagElement,
} from "@/lib/browser-element-tag";
import {
  createComposerTagIconElement,
  hydrateComposerTagIcons,
} from "@/lib/composer-tag-present";
import {
  formatActionTagMarkup,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";

export const COMPOSER_TAG_CLASS = "composer-prompt-tag";
export const COMPOSER_VOICE_STREAM_ATTR = "data-composer-voice-stream";

export function isComposerTagElement(el: Element): boolean {
  return (
    el instanceof HTMLElement
    && el.classList.contains(COMPOSER_TAG_CLASS)
    && el.hasAttribute("data-qkrpc-id")
  );
}

export function isComposerChipElement(el: Element): boolean {
  return isComposerTagElement(el) || isBrowserElementTagElement(el);
}

export function actionFromTagElement(el: HTMLElement): PinnedAction | null {
  const id = el.getAttribute("data-qkrpc-id")?.trim();
  const title = el.getAttribute("data-qkrpc-title")?.trim();
  if (!id || !title) return null;
  const kindRaw = el.getAttribute("data-qkrpc-kind")?.trim();
  return {
    id,
    title,
    kind: kindRaw === "subprogram" ? "subprogram" : "action",
    lastEditTimeLocal: el.getAttribute("data-qkrpc-last-edit")?.trim() || undefined,
    description: el.getAttribute("data-qkrpc-desc")?.trim() || undefined,
    icon: el.getAttribute("data-qkrpc-icon")?.trim() || undefined,
    callIdentifier: el.getAttribute("data-qkrpc-call-id")?.trim() || undefined,
  };
}

export function tagElementToMarkup(el: HTMLElement): string {
  const browserElement = browserElementTagFromDom(el);
  if (browserElement) return formatBrowserElementTagMarkup(browserElement);
  const action = actionFromTagElement(el);
  return action ? formatActionTagMarkup(action) : "";
}

/** Build a non-editable browser-element chip for the composer. */
export function createBrowserElementTagElement(
  element: BrowserElementTag,
): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `${COMPOSER_TAG_CLASS} ${BROWSER_ELEMENT_TAG_CLASS}`;
  span.contentEditable = "false";
  span.setAttribute(BROWSER_ELEMENT_TAG_ATTR, element.tagId);
  span.setAttribute("data-browser-title", element.chipTitle);
  span.setAttribute("data-browser-url", element.url);
  span.setAttribute("data-browser-pick-x", String(element.pickX));
  span.setAttribute("data-browser-pick-y", String(element.pickY));

  const optional: Array<[string, string | null | undefined]> = [
    ["data-browser-page-title", element.title ?? null],
    ["data-browser-ref", element.ref],
    ["data-browser-ref-role", element.refRole],
    ["data-browser-ref-name", element.refName],
    ["data-browser-tag", element.tagName],
    ["data-browser-text", element.text],
    ["data-browser-id", element.elementId],
    ["data-browser-class", element.className],
    ["data-browser-href", element.href],
    ["data-browser-value", element.value],
    ["data-browser-snapshot-line", element.snapshotLine],
    ["data-browser-session-id", element.sessionId],
  ];
  for (const [key, value] of optional) {
    const trimmed = value?.trim();
    if (trimmed) span.setAttribute(key, trimmed);
  }

  const icon = document.createElement("span");
  icon.className = "composer-prompt-tag__icon composer-prompt-tag__icon--browser";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 8.5 8.5 1.5M8.5 1.5H5.5M8.5 1.5V4.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="2.75" cy="7.25" r="0.85" fill="currentColor"></circle></svg>';
  span.append(icon);

  const title = document.createElement("span");
  title.className = "composer-prompt-tag__title";
  title.textContent = element.chipTitle;
  span.append(title);

  return span;
}

/** Trailing spacer after an inline chip (backspace target + visual gap). */
export function createComposerTagSpacer(): Text {
  return document.createTextNode("\u00a0");
}

/**
 * Anchor the caret inside the spacer text node so IME composition works
 * immediately after a chip (setStartAfter leaves the caret on the root element).
 */
export function placeCaretAfterComposerTagSpacer(
  spacer: Text,
  root: HTMLElement,
): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(spacer, spacer.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus({ preventScroll: true });
}

/** Build a non-editable chip inserted into the contenteditable composer. */
export function createComposerTagElement(action: PinnedAction): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = COMPOSER_TAG_CLASS;
  if (action.kind === "subprogram") {
    span.classList.add("composer-prompt-tag--subprogram");
  }
  span.contentEditable = "false";
  span.setAttribute("data-qkrpc-id", action.id);
  span.setAttribute("data-qkrpc-title", action.title);
  if (action.kind === "subprogram") {
    span.setAttribute("data-qkrpc-kind", "subprogram");
  }
  if (action.lastEditTimeLocal) {
    span.setAttribute("data-qkrpc-last-edit", action.lastEditTimeLocal);
  }
  if (action.description?.trim()) {
    span.setAttribute("data-qkrpc-desc", action.description.trim());
  }
  if (action.icon?.trim()) {
    span.setAttribute("data-qkrpc-icon", action.icon.trim());
  }
  if (action.callIdentifier?.trim()) {
    span.setAttribute("data-qkrpc-call-id", action.callIdentifier.trim());
  }

  span.append(createComposerTagIconElement(action));

  const title = document.createElement("span");
  title.className = "composer-prompt-tag__title";
  title.textContent = action.title;
  span.append(title);

  return span;
}

/** Paint stored markup as inline chips + text inside the composer. */
export function renderMarkupIntoRoot(root: HTMLElement, markup: string): void {
  root.replaceChildren();
  if (!markup) return;

  for (const segment of parseUserMessageSegments(markup)) {
    if (segment.type === "tag") {
      root.append(createComposerTagElement(segment.action));
      continue;
    }
    if (segment.type === "browser-element") {
      root.append(createBrowserElementTagElement(segment.element));
      continue;
    }
    appendTextWithNewlines(root, segment.text);
  }
  hydrateComposerTagIcons(root);
}

export function serializeComposerNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === "BR") {
    return "\n";
  }
  if (isComposerChipElement(el)) {
    return tagElementToMarkup(el);
  }
  if (tag === "DIV" || tag === "P") {
    const inner = serializeComposerChildren(el);
    return inner.endsWith("\n") ? inner : `${inner}\n`;
  }
  return serializeComposerChildren(el);
}

export function serializeComposerChildren(root: HTMLElement): string {
  let out = "";
  for (const child of root.childNodes) {
    out += serializeComposerNode(child);
  }
  return out;
}

export function serializeComposerRoot(root: HTMLElement): string {
  const raw = serializeComposerChildren(root).replace(/\n{3,}/g, "\n\n");
  if (!raw.trim()) return "";
  return raw;
}

export function isComposerDomEmpty(root: HTMLElement): boolean {
  return serializeComposerRoot(root) === "";
}

export function serializeComposerRange(range: Range): string {
  const wrap = document.createElement("div");
  wrap.append(range.cloneContents());
  return serializeComposerRoot(wrap);
}

export function selectionHasComposerTags(range: Range): boolean {
  const wrap = document.createElement("div");
  wrap.append(range.cloneContents());
  return wrap.querySelector(`.${COMPOSER_TAG_CLASS}`) !== null;
}

function isIgnorableTextContent(text: string): boolean {
  return text.replace(/\u00a0/g, " ").trim() === "";
}

function resolveTagInRoot(
  root: HTMLElement,
  fragmentNode: Node,
): HTMLElement | null {
  if (fragmentNode.nodeType !== Node.ELEMENT_NODE) return null;
  if (!isComposerChipElement(fragmentNode as Element)) return null;
  const el = fragmentNode as HTMLElement;
  const browserId = el.getAttribute(BROWSER_ELEMENT_TAG_ATTR);
  if (browserId) {
    return root.querySelector(
      `[${BROWSER_ELEMENT_TAG_ATTR}="${CSS.escape(browserId)}"]`,
    ) as HTMLElement | null;
  }
  const id = el.getAttribute("data-qkrpc-id");
  if (!id) return null;
  return root.querySelector(
    `[data-qkrpc-id="${CSS.escape(id)}"]`,
  ) as HTMLElement | null;
}

/** Tag immediately before the caret (skips spacer whitespace / nbsp). */
export function findComposerTagForBackspace(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let node: Node | null = range.startContainer;
  while (node && node !== root) {
    if (
      node.nodeType === Node.ELEMENT_NODE
      && isComposerChipElement(node as Element)
    ) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }

  const probe = document.createRange();
  probe.setStart(root, 0);
  probe.setEnd(range.startContainer, range.startOffset);
  const children = [...probe.cloneContents().childNodes];

  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i]!;
    if (
      child.nodeType === Node.TEXT_NODE
      && isIgnorableTextContent(child.textContent ?? "")
    ) {
      continue;
    }
    const tag = resolveTagInRoot(root, child);
    if (tag) return tag;
    return null;
  }
  return null;
}

/** Tag immediately after the caret (skips spacer whitespace / nbsp). */
export function findComposerTagForDelete(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  let node: Node | null = range.startContainer;
  while (node && node !== root) {
    if (
      node.nodeType === Node.ELEMENT_NODE
      && isComposerChipElement(node as Element)
    ) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }

  const probe = document.createRange();
  probe.setStart(range.endContainer, range.endOffset);
  probe.setEnd(root, root.childNodes.length);
  const children = [...probe.cloneContents().childNodes];

  for (const child of children) {
    if (
      child.nodeType === Node.TEXT_NODE
      && isIgnorableTextContent(child.textContent ?? "")
    ) {
      continue;
    }
    const tag = resolveTagInRoot(root, child);
    if (tag) return tag;
    return null;
  }
  return null;
}

export function removeComposerTagElement(tag: HTMLElement): void {
  const after = tag.nextSibling;
  if (
    after?.nodeType === Node.TEXT_NODE
    && isIgnorableTextContent(after.textContent ?? "")
  ) {
    after.remove();
  }
  tag.remove();
}

/** Remove one tag atomically; prefers execCommand for undo support. */
export function deleteComposerTagWithUndo(
  tag: HTMLElement,
  root: HTMLElement,
): boolean {
  const selection = window.getSelection();
  if (!selection) return false;

  const parent = tag.parentNode;
  const index =
    parent !== null ? Array.prototype.indexOf.call(parent.childNodes, tag) : -1;

  const caret = document.createRange();
  if (parent && index > 0) {
    const prev = parent.childNodes[index - 1]!;
    if (prev.nodeType === Node.TEXT_NODE) {
      caret.setStart(prev, (prev as Text).length);
    } else {
      caret.setStartAfter(prev);
    }
  } else if (parent) {
    caret.setStart(parent, index);
  } else {
    caret.setStart(root, 0);
  }
  caret.collapse(true);

  const del = document.createRange();
  del.selectNode(tag);
  selection.removeAllRanges();
  selection.addRange(del);
  const undone = document.execCommand("delete");
  selection.removeAllRanges();
  selection.addRange(caret);

  if (!undone) {
    removeComposerTagElement(tag);
  }
  return true;
}

/** Strip placeholder <br> on blur only (avoids breaking undo during typing). */
export function normalizeEmptyComposerRoot(root: HTMLElement): boolean {
  if (!isComposerDomEmpty(root)) return false;
  if (root.childNodes.length === 0) return false;
  root.replaceChildren();
  return true;
}

export function placeCaretAtStart(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (root.childNodes.length === 0) {
    range.setStart(root, 0);
  } else {
    range.selectNodeContents(root);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Keep the caret at the visual start when the field is logically empty.
 * Avoids the caret sitting on a second line below a placeholder <br>.
 */
export function ensureEmptyComposerCaret(root: HTMLElement): void {
  if (!isComposerDomEmpty(root)) return;

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.setStart(root, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function placeCaretAtEnd(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Keep focus caret inside the composer after DOM mutations. */
export function ensureCaretInRoot(root: HTMLElement): void {
  const selection = window.getSelection();
  if (
    selection?.rangeCount
    && selection.anchorNode
    && root.contains(selection.anchorNode)
  ) {
    return;
  }
  placeCaretAtStart(root);
}

export function appendTextWithNewlines(parent: ParentNode, text: string): void {
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i]) {
      parent.append(document.createTextNode(parts[i]));
    }
    if (i < parts.length - 1) {
      parent.append(document.createElement("br"));
    }
  }
}

function insertFragmentAtSelection(
  root: HTMLElement,
  fragment: DocumentFragment,
): void {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) {
    root.append(fragment);
    return;
  }

  const range = selection.getRangeAt(0);
  const inserted: Node[] = [...fragment.childNodes];
  range.deleteContents();
  range.insertNode(fragment);

  const last = inserted[inserted.length - 1];
  if (last?.parentNode) {
    range.setStartAfter(last);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function prepareComposerPasteRoot(root: HTMLElement): void {
  root.focus();
  ensureCaretInRoot(root);
}

export function findComposerVoiceStream(root: HTMLElement): HTMLElement | null {
  return root.querySelector(`[${COMPOSER_VOICE_STREAM_ATTR}]`);
}

function insertNodeAtComposerSelection(root: HTMLElement, node: Node): void {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) {
    root.append(node);
    placeCaretAtEnd(root);
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceVoiceStreamSpan(
  root: HTMLElement,
  span: HTMLElement,
  text: string,
): void {
  const parent = span.parentNode;
  if (!parent) return;

  const next = document.createDocumentFragment();
  if (text) {
    appendTextWithNewlines(next, text.replace(/\r\n?/g, "\n"));
  }
  parent.insertBefore(next, span);
  span.remove();
  placeCaretAtEnd(root);
}

/** Begin a live voice transcription region at the current caret. */
export function beginComposerVoiceStream(root: HTMLElement): boolean {
  const existing = findComposerVoiceStream(root);
  if (existing) {
    existing.remove();
  }

  const span = document.createElement("span");
  span.setAttribute(COMPOSER_VOICE_STREAM_ATTR, "1");
  span.append(document.createTextNode(""));
  insertNodeAtComposerSelection(root, span);
  return true;
}

/** Replace in-progress voice text (partial ASR). */
export function updateComposerVoiceStream(
  root: HTMLElement,
  text: string,
): boolean {
  const span = findComposerVoiceStream(root);
  if (!span) return false;
  span.textContent = text.replace(/\r\n?/g, "\n");
  placeCaretAtEnd(root);
  return true;
}

/** Finalize voice stream as plain text in the composer. */
export function endComposerVoiceStream(
  root: HTMLElement,
  finalText?: string,
): boolean {
  const span = findComposerVoiceStream(root);
  if (!span) return false;
  const text =
    finalText !== undefined ? finalText : (span.textContent ?? "");
  replaceVoiceStreamSpan(root, span, text);
  return true;
}

/** Drop in-progress voice text without inserting. */
export function cancelComposerVoiceStream(root: HTMLElement): boolean {
  const span = findComposerVoiceStream(root);
  if (!span) return false;
  span.remove();
  ensureCaretInRoot(root);
  return true;
}

/** Plain-text paste via execCommand so Ctrl+Z can revert it. */
export function insertPlainTextWithUndo(
  root: HTMLElement,
  text: string,
): boolean {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized) return true;

  prepareComposerPasteRoot(root);
  if (document.execCommand("insertText", false, normalized)) {
    return true;
  }

  const fragment = document.createDocumentFragment();
  appendTextWithNewlines(fragment, normalized);
  insertFragmentAtSelection(root, fragment);
  return false;
}

/** Markup paste (chips + text) via execCommand insertHTML for undo support. */
export function insertComposerMarkupPasteWithUndo(
  root: HTMLElement,
  markup: string,
): boolean {
  const fragment = document.createDocumentFragment();
  for (const segment of parseUserMessageSegments(markup)) {
    if (segment.type === "tag") {
      fragment.append(createComposerTagElement(segment.action));
      continue;
    }
    if (segment.type === "browser-element") {
      fragment.append(createBrowserElementTagElement(segment.element));
      continue;
    }
    appendTextWithNewlines(fragment, segment.text);
  }

  const temp = document.createElement("div");
  while (fragment.firstChild) {
    temp.appendChild(fragment.firstChild);
  }
  const html = temp.innerHTML;
  if (!html) return true;

  prepareComposerPasteRoot(root);
  if (document.execCommand("insertHTML", false, html)) {
    return true;
  }

  const fallback = document.createDocumentFragment();
  while (temp.firstChild) {
    fallback.appendChild(temp.firstChild);
  }
  insertFragmentAtSelection(root, fallback);
  return false;
}
