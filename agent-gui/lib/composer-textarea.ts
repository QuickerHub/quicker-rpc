import type { PinnedAction } from "@/lib/action-context";
import { formatActionTagMarkup } from "@/lib/compose-user-message";

const ACTION_TAG_IN_TEXT =
  /<qkrpc-action-tag[\s\S]*?(?:\/>|><\/qkrpc-action-tag>)/gi;

const TAG_BOUNDARY = "\uFFFC";

export type TextareaMentionMatch = {
  query: string;
  start: number;
  end: number;
};

export function insertTextAtTextareaSelection(
  current: string,
  insert: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  const value = current.slice(0, selectionStart) + insert + current.slice(selectionEnd);
  const caret = selectionStart + insert.length;
  return { value, selectionStart: caret, selectionEnd: caret };
}

export function insertActionTagAtTextarea(
  textarea: HTMLTextAreaElement,
  current: string,
  action: PinnedAction,
): string {
  const markup = formatActionTagMarkup(action);
  const spacer = current.length > 0 && !/\s$/.test(current.slice(0, textarea.selectionStart))
    ? " "
    : "";
  const { value, selectionStart, selectionEnd } = insertTextAtTextareaSelection(
    current,
    `${spacer}${markup} `,
    textarea.selectionStart,
    textarea.selectionEnd,
  );
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
  });
  return value;
}

/** Map caret in raw markup to "visible" text (tags → single boundary char). */
function visiblePrefixBeforeCaret(text: string, caret: number): string {
  let visible = "";
  let index = 0;
  while (index < caret) {
    ACTION_TAG_IN_TEXT.lastIndex = 0;
    const slice = text.slice(index);
    const tagMatch = slice.match(/^<qkrpc-action-tag[\s\S]*?(?:\/>|><\/qkrpc-action-tag>)/i);
    if (tagMatch) {
      visible += TAG_BOUNDARY;
      index += tagMatch[0].length;
      continue;
    }
    visible += text[index];
    index += 1;
  }
  return visible;
}

/** Map a visible-string index back to raw markup index. */
function rawIndexFromVisibleIndex(text: string, visibleIndex: number): number {
  let visible = 0;
  let raw = 0;
  while (raw < text.length && visible < visibleIndex) {
    ACTION_TAG_IN_TEXT.lastIndex = 0;
    const slice = text.slice(raw);
    const tagMatch = slice.match(/^<qkrpc-action-tag[\s\S]*?(?:\/>|><\/qkrpc-action-tag>)/i);
    if (tagMatch) {
      raw += tagMatch[0].length;
      visible += 1;
      continue;
    }
    raw += 1;
    visible += 1;
  }
  return raw;
}

/** Active @-mention in markup textarea (ignores @ inside tag markup). */
export function getTextareaMentionMatch(
  text: string,
  caret: number,
): TextareaMentionMatch | null {
  const visible = visiblePrefixBeforeCaret(text, caret);
  const match = visible.match(/(?:^|[\s\n\uFFFC])@([^\s@\uFFFC]*)$/);
  if (!match) return null;

  const query = match[1];
  const atVisibleIndex = visible.length - query.length - 1;
  const start = rawIndexFromVisibleIndex(text, atVisibleIndex);
  return { query, start, end: caret };
}

export function applyTextareaMentionTag(
  text: string,
  match: TextareaMentionMatch,
  action: PinnedAction,
): string {
  const tag = formatActionTagMarkup(action);
  return `${text.slice(0, match.start)}${tag} ${text.slice(match.end)}`;
}

/** Caret index immediately after a mention tag replacement. */
export function caretAfterTextareaMentionTag(
  match: TextareaMentionMatch,
  action: PinnedAction,
): number {
  return match.start + formatActionTagMarkup(action).length + 1;
}

function getTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  const props = [
    "direction",
    "boxSizing",
    "width",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textTransform",
    "wordSpacing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ] as const;
  for (const prop of props) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  const textBefore = textarea.value.substring(0, position);
  mirror.textContent = textBefore;
  if (textBefore.endsWith("\n")) {
    mirror.textContent += " ";
  }
  const marker = document.createElement("span");
  marker.textContent = ".";
  mirror.append(marker);
  document.body.append(mirror);
  const top =
    marker.offsetTop
    + Number.parseFloat(style.borderTopWidth)
    - textarea.scrollTop;
  const left =
    marker.offsetLeft
    + Number.parseFloat(style.borderLeftWidth)
    - textarea.scrollLeft;
  mirror.remove();
  return { top, left };
}

/** Approximate caret screen position for the mention menu. */
export function getTextareaCaretClientRect(
  textarea: HTMLTextAreaElement,
): DOMRect {
  const { top, left } = getTextareaCaretOffset(textarea, textarea.selectionStart);
  const box = textarea.getBoundingClientRect();
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  return new DOMRect(box.left + left, box.top + top, 0, lineHeight);
}
