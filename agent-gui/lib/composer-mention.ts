import type { PinnedAction } from "@/lib/action-context";
import {
  createComposerTagElement,
  isComposerTagElement,
} from "@/lib/composer-inline";

/** Marks non-text boundaries (tags) while scanning plain text before the caret. */
const TAG_BOUNDARY = "\uFFFC";

export type ComposerMentionMatch = {
  query: string;
  range: Range;
};

type CharPos = {
  node: Text;
  offset: number;
};

function appendTextChars(
  out: { ch: string; pos: CharPos }[],
  text: string,
  node: Text,
): void {
  for (let i = 0; i < text.length; i += 1) {
    out.push({ ch: text[i], pos: { node, offset: i } });
  }
}

function walkComposerBeforeCaret(
  root: HTMLElement,
  caret: Range,
  out: { ch: string; pos: CharPos }[],
): void {
  function walk(node: Node): boolean {
    if (node === caret.startContainer && node.nodeType === Node.TEXT_NODE) {
      appendTextChars(out, (node as Text).data.slice(0, caret.startOffset), node as Text);
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextChars(out, (node as Text).data, node as Text);
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;

    const el = node as HTMLElement;
    const tag = el.tagName;
    if (isComposerTagElement(el)) {
      out.push({ ch: TAG_BOUNDARY, pos: { node: el as unknown as Text, offset: 0 } });
      return false;
    }
    if (tag === "BR") {
      out.push({ ch: "\n", pos: { node: el as unknown as Text, offset: 0 } });
      return false;
    }

    const elementChildren = el.childNodes;
    for (let i = 0; i < elementChildren.length; i += 1) {
      if (walk(elementChildren[i]!)) return true;
    }
    return false;
  }

  for (const child of root.childNodes) {
    if (walk(child)) break;
  }
}

/** Active @-mention at the caret, if any. */
export function getComposerMentionMatch(root: HTMLElement): ComposerMentionMatch | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;

  const caret = selection.getRangeAt(0);
  if (!root.contains(caret.startContainer)) return null;
  if (caret.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const chars: { ch: string; pos: CharPos }[] = [];
  walkComposerBeforeCaret(root, caret, chars);
  if (chars.length === 0) return null;

  const text = chars.map((entry) => entry.ch).join("");
  const match = text.match(/(?:^|[\s\n\uFFFC])@([^\s@\uFFFC]*)$/);
  if (!match) return null;

  const query = match[1];
  const atIndex = text.length - query.length - 1;
  const atEntry = chars[atIndex];
  if (!atEntry || atEntry.ch !== "@") return null;
  if (atEntry.pos.node.nodeType !== Node.TEXT_NODE) return null;

  const range = document.createRange();
  range.setStart(atEntry.pos.node, atEntry.pos.offset);
  range.setEnd(caret.startContainer, caret.startOffset);
  return { query, range };
}

export function getComposerMentionAnchorRect(range: Range): DOMRect {
  const probe = range.cloneRange();
  probe.collapse(false);
  const rects = probe.getClientRects();
  if (rects.length > 0) return rects[rects.length - 1];
  return probe.getBoundingClientRect();
}

export function applyComposerMentionTag(
  root: HTMLElement,
  mentionRange: Range,
  action: PinnedAction,
): void {
  mentionRange.deleteContents();
  const chip = createComposerTagElement(action);
  mentionRange.insertNode(chip);
  const spacer = document.createTextNode("\u00a0");
  chip.after(spacer);

  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(spacer);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.focus();
}
