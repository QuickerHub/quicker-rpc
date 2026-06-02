import type { PinnedAction } from "@/lib/action-context";
import {
  formatActionTagMarkup,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";

export const COMPOSER_TAG_CLASS = "composer-prompt-tag";

export function isComposerTagElement(el: Element): boolean {
  return (
    el instanceof HTMLElement
    && el.classList.contains(COMPOSER_TAG_CLASS)
    && el.hasAttribute("data-qkrpc-id")
  );
}

export function actionFromTagElement(el: HTMLElement): PinnedAction | null {
  const id = el.getAttribute("data-qkrpc-id")?.trim();
  const title = el.getAttribute("data-qkrpc-title")?.trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    lastEditTimeLocal: el.getAttribute("data-qkrpc-last-edit")?.trim() || undefined,
  };
}

export function tagElementToMarkup(el: HTMLElement): string {
  const action = actionFromTagElement(el);
  return action ? formatActionTagMarkup(action) : "";
}

/** Build a non-editable chip inserted into the contenteditable composer. */
export function createComposerTagElement(action: PinnedAction): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = COMPOSER_TAG_CLASS;
  span.contentEditable = "false";
  span.setAttribute("data-qkrpc-id", action.id);
  span.setAttribute("data-qkrpc-title", action.title);
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
    appendTextWithNewlines(root, segment.text);
  }
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
  if (isComposerTagElement(el)) {
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
  if (!isComposerTagElement(fragmentNode as Element)) return null;
  const id = (fragmentNode as HTMLElement).getAttribute("data-qkrpc-id");
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
      && isComposerTagElement(node as Element)
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
      && isComposerTagElement(node as Element)
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
