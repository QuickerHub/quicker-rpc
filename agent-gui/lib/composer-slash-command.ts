import {
  getComposerMentionAnchorRect,
  type ComposerMentionMatch,
} from "@/lib/composer-mention";
import { placeCaretAtEnd } from "@/lib/composer-inline";

export type ComposerSlashMatch = ComposerMentionMatch;

/** Active /-command at the caret, if any. */
export function getComposerSlashMatch(root: HTMLElement): ComposerSlashMatch | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;

  const caret = selection.getRangeAt(0);
  if (!root.contains(caret.startContainer)) return null;
  if (caret.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = caret.startContainer as Text;
  const before = textNode.data.slice(0, caret.startOffset);
  const match = before.match(/(?:^|[\s\n])\/([a-z][\w-]*)$/i);
  if (!match) return null;

  const query = match[1];
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

export function applyComposerSlashCommand(
  root: HTMLElement,
  slashRange: Range,
  commandName: string,
): void {
  slashRange.deleteContents();
  const textNode = document.createTextNode(`/${commandName} `);
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
