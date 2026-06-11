import type { SlashCatalogItem } from "@/lib/composer-slash-catalog";
import {
  createSlashTagElement,
  type SlashTagRef,
} from "@/lib/composer-slash-tag";
import {
  getComposerMentionAnchorRect,
  type ComposerMentionMatch,
} from "@/lib/composer-mention";
import {
  createComposerTagSpacer,
  placeCaretAfterComposerTagSpacer,
  placeCaretAtEnd,
} from "@/lib/composer-inline";

export type ComposerSlashMatch = ComposerMentionMatch;

/** Parse slash query from text before caret; empty string when only `/` was typed. */
export function parseSlashQueryBeforeCaret(before: string): string | null {
  const slashMatch = before.match(/(?:^|[\s\n])\/(?:([a-z][\w-]*))?$/i);
  if (!slashMatch) return null;
  return slashMatch[1] ?? "";
}

/** Active /-command at the caret, if any. */
export function getComposerSlashMatch(root: HTMLElement): ComposerSlashMatch | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;

  const caret = selection.getRangeAt(0);
  if (!root.contains(caret.startContainer)) return null;
  if (caret.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = caret.startContainer as Text;
  const before = textNode.data.slice(0, caret.startOffset);
  const query = parseSlashQueryBeforeCaret(before);
  if (query === null) return null;

  const slashIndex = before.lastIndexOf("/");
  if (slashIndex < 0) return null;

  const range = document.createRange();
  range.setStart(textNode, slashIndex);
  range.setEnd(caret.startContainer, caret.startOffset);
  return { query, range };
}

export function getComposerSlashAnchorRect(range: Range): DOMRect {
  return getComposerMentionAnchorRect(range);
}

export function applyComposerSlashInsert(
  root: HTMLElement,
  slashRange: Range,
  text: string,
): void {
  slashRange.deleteContents();
  const textNode = document.createTextNode(text);
  slashRange.insertNode(textNode);
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    placeCaretAtEnd(root);
  }
}

export function applyComposerSlashCommand(
  root: HTMLElement,
  slashRange: Range,
  commandName: string,
): void {
  applyComposerSlashInsert(root, slashRange, `/${commandName} `);
}

export function applyComposerSlashTag(
  root: HTMLElement,
  slashRange: Range,
  item: SlashCatalogItem,
): void {
  slashRange.deleteContents();
  const ref: SlashTagRef = { kind: item.kind, name: item.name };
  const chip = createSlashTagElement(ref);
  slashRange.insertNode(chip);
  const spacer = createComposerTagSpacer();
  chip.after(spacer);
  placeCaretAfterComposerTagSpacer(spacer, root);
}
