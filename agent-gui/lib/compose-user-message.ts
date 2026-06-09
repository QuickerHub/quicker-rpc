import type { PinnedAction } from "@/lib/action-context";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import {
  browserElementTagFromAttrs,
  expandBrowserElementTagForModel,
} from "@/lib/browser-element-tag";
import { formatActionQkaForModel } from "@/lib/action-qka-prompt";
import { formatActionIdShort } from "@/lib/action-patch-followup";
import { normalizeActionId } from "@/lib/qka-markup";
import {
  findQkaMarkupMatches,
  parseHtmlAttrs,
  parseQkaRefFromAttrs,
} from "@/lib/qka-markup";

/** Stored in chat history; expanded to {@link formatActionQkaForModel} before the model. */
const ACTION_TAG_RE = new RegExp(
  "<qkrpc-action-tag\\s+([^>]*?)\\s*(?:/>|></qkrpc-action-tag>)",
  "gi",
);

const QKA_LINK_TAG_RE =
  /<qka-link\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/qka-link>)/gi;

const BROWSER_ELEMENT_TAG_RE = new RegExp(
  "<qkrpc-browser-element\\s+([^>]*?)\\s*(?:/>|></qkrpc-browser-element>)",
  "gi",
);

const INLINE_MARKUP_PROBE_RE =
  /<qkrpc-action-tag|<qkrpc-browser-element|<qka-link\s|<qka\s/i;

const LEGACY_ACTION_LINE_RE =
  /^\[动作:\s*([^\]]+)\]\s*actionId=([^\s,]+)(?:,\s*lastEdit=([^\n,]+))?/;

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function pinnedActionFromTagAttrs(attrs: Record<string, string>): PinnedAction | null {
  const id = attrs["data-id"]?.trim();
  const title = attrs["data-title"]?.trim();
  if (!id || !title) return null;
  const kindRaw = attrs["data-kind"]?.trim();
  const kind = kindRaw === "subprogram" ? "subprogram" : "action";
  return {
    id,
    title,
    kind,
    lastEditTimeLocal: attrs["data-last-edit"]?.trim() || undefined,
    description: attrs["data-desc"]?.trim() || undefined,
    icon: attrs["data-icon"]?.trim() || undefined,
    callIdentifier: attrs["data-call-id"]?.trim() || undefined,
  };
}

/** HTML marker kept in UI message text; renders as a chip in the chat bubble. */
export function formatActionTagMarkup(action: PinnedAction): string {
  const attrs = [
    `data-id="${escapeAttrValue(action.id)}"`,
    `data-title="${escapeAttrValue(action.title)}"`,
  ];
  if (action.kind === "subprogram") {
    attrs.push('data-kind="subprogram"');
  }
  if (action.lastEditTimeLocal) {
    attrs.push(`data-last-edit="${escapeAttrValue(action.lastEditTimeLocal)}"`);
  }
  if (action.description?.trim()) {
    attrs.push(`data-desc="${escapeAttrValue(action.description.trim())}"`);
  }
  if (action.icon?.trim()) {
    attrs.push(`data-icon="${escapeAttrValue(action.icon.trim())}"`);
  }
  if (action.callIdentifier?.trim()) {
    attrs.push(`data-call-id="${escapeAttrValue(action.callIdentifier.trim())}"`);
  }
  return `<qkrpc-action-tag ${attrs.join(" ")}></qkrpc-action-tag>`;
}

/** One action reference line for the model (legacy compose helpers). */
export function formatActionTagLine(action: PinnedAction): string {
  return formatActionQkaForModel(action);
}

/** Compose the user message sent to the model from draft tags + textarea. */
export function composeUserMessage(
  tags: PinnedAction[],
  userText: string,
): string {
  const body = userText.trim();
  if (tags.length === 0) {
    return body;
  }
  const header = tags.map(formatActionTagLine).join("\n");
  return body ? `${header}\n\n${body}` : header;
}

/** Compose text stored in chat history (tag markup + user body). */
export function composeUserMessageDisplay(
  tags: PinnedAction[],
  userText: string,
): string {
  const body = userText.trim();
  if (tags.length === 0) {
    return body;
  }
  const header = tags.map(formatActionTagMarkup).join("\n");
  return body ? `${header}\n\n${body}` : header;
}

/** Expand stored markup to model-facing <qka> tags before convertToModelMessages. */
export function expandUserMessageForModel(text: string): string {
  if (!INLINE_MARKUP_PROBE_RE.test(text)) {
    return text.trim();
  }

  let expandedAny = false;
  const expanded = text
    .replace(BROWSER_ELEMENT_TAG_RE, (_full, attrStr: string) => {
      const element = browserElementTagFromAttrs(parseHtmlAttrs(attrStr));
      if (!element) return "";
      expandedAny = true;
      return expandBrowserElementTagForModel(element);
    })
    .replace(ACTION_TAG_RE, (_full, attrStr: string) => {
      const action = pinnedActionFromTagAttrs(parseHtmlAttrs(attrStr));
      if (!action) return "";
      expandedAny = true;
      return formatActionQkaForModel(action);
    })
    .replace(QKA_LINK_TAG_RE, (_full, attrStr: string, innerText: string) => {
      const action = pinnedActionFromQkaLinkAttrs(
        parseHtmlAttrs(attrStr),
        innerText ?? "",
      );
      if (!action) return "";
      expandedAny = true;
      return formatActionQkaForModel(action);
    });

  return expandedAny ? expanded.trim() : text.trim();
}

export type UserMessageSegment =
  | { type: "tag"; action: PinnedAction }
  | { type: "browser-element"; element: BrowserElementTag }
  | { type: "text"; text: string };

function pinnedActionFromQkaLinkAttrs(
  attrs: Record<string, string>,
  innerText: string,
): PinnedAction | null {
  const id = normalizeActionId(attrs.id ?? "");
  if (!id) return null;
  const title = innerText.trim() || formatActionIdShort(id);
  return { id, title };
}

function pinnedActionFromQkaRef(
  attrs: Record<string, string>,
  innerText: string,
): PinnedAction | null {
  const ref = parseQkaRefFromAttrs(attrs, innerText);
  if (!ref) return null;
  return {
    id: ref.actionId,
    title: ref.title,
    kind: ref.kind === "subprogram" ? "subprogram" : undefined,
    callIdentifier: ref.callIdentifier,
  };
}

type InlineUserMarkupHit =
  | { index: number; length: number; kind: "action"; action: PinnedAction }
  | { index: number; length: number; kind: "browser-element"; element: BrowserElementTag };

function findInlineUserMarkupHits(text: string): InlineUserMarkupHit[] {
  const hits: InlineUserMarkupHit[] = [];

  const browserRe = new RegExp(BROWSER_ELEMENT_TAG_RE.source, "gi");
  let browserMatch: RegExpExecArray | null;
  while ((browserMatch = browserRe.exec(text)) !== null) {
    const element = browserElementTagFromAttrs(parseHtmlAttrs(browserMatch[1]));
    if (!element) continue;
    hits.push({
      index: browserMatch.index,
      length: browserMatch[0].length,
      kind: "browser-element",
      element,
    });
  }

  const tagRe = new RegExp(ACTION_TAG_RE.source, "gi");
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(text)) !== null) {
    const action = pinnedActionFromTagAttrs(parseHtmlAttrs(tagMatch[1]));
    if (!action) continue;
    hits.push({
      index: tagMatch.index,
      length: tagMatch[0].length,
      kind: "action",
      action,
    });
  }

  for (const match of findQkaMarkupMatches(text)) {
    const action = match.kind === "ref"
      ? pinnedActionFromQkaRef(match.attrs, match.innerText)
      : pinnedActionFromQkaLinkAttrs(match.attrs, match.innerText);
    if (!action) continue;
    hits.push({
      index: match.index,
      length: match.length,
      kind: "action",
      action,
    });
  }

  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function parseInlineTagSegments(text: string): UserMessageSegment[] {
  const segments: UserMessageSegment[] = [];
  const hits = findInlineUserMarkupHits(text);
  let last = 0;
  for (const hit of hits) {
    if (hit.index > last) {
      segments.push({ type: "text", text: text.slice(last, hit.index) });
    }
    if (hit.kind === "browser-element") {
      segments.push({ type: "browser-element", element: hit.element });
    } else {
      segments.push({ type: "tag", action: hit.action });
    }
    last = hit.index + hit.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", text: text.slice(last) });
  }
  return segments;
}

/** Ordered inline segments (tags may appear anywhere in the text). */
export function parseUserMessageSegments(text: string): UserMessageSegment[] {
  if (!text) return [];

  if (
    text.includes("<qkrpc-action-tag")
    || text.includes("<qkrpc-browser-element")
    || text.includes("<qka-link")
    || text.includes("<qka")
  ) {
    return parseInlineTagSegments(text);
  }

  const lines = text.split("\n");
  const segments: UserMessageSegment[] = [];
  let index = 0;
  while (index < lines.length) {
    const legacy = lines[index].match(LEGACY_ACTION_LINE_RE);
    if (!legacy) break;
    segments.push({
      type: "tag",
      action: {
        title: legacy[1].trim(),
        id: legacy[2].trim(),
        lastEditTimeLocal: legacy[3]?.trim(),
      },
    });
    index += 1;
  }

  const rest = lines.slice(index).join("\n").replace(/^\n+/, "");
  if (rest) {
    segments.push({ type: "text", text: rest });
  } else if (segments.length === 0) {
    segments.push({ type: "text", text });
  }
  return segments;
}

export type ParsedUserMessage = {
  tags: PinnedAction[];
  body: string;
};

/** Parse stored user message (tags + concatenated plain text). */
export function parseUserMessageContent(text: string): ParsedUserMessage {
  const segments = parseUserMessageSegments(text);
  const tags = segments
    .filter((s): s is { type: "tag"; action: PinnedAction } => s.type === "tag")
    .map((s) => s.action);
  const body = segments
    .filter((s): s is { type: "text"; text: string } => s.type === "text")
    .map((s) => s.text)
    .join("");
  return { tags, body: body.trim() };
}

export function canSendComposedMessage(draft: string): boolean {
  const segments = parseUserMessageSegments(draft);
  return segments.some(
    (s) =>
      s.type === "tag"
      || s.type === "browser-element"
      || (s.type === "text" && s.text.trim().length > 0),
  );
}

/** Plain-text preview for queued composer messages (tags → @title). */
export function formatComposerQueuePreview(text: string, maxLen = 120): string {
  const segments = parseUserMessageSegments(text);
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.type === "tag") {
      parts.push(`@${segment.action.title}`);
    } else if (segment.type === "browser-element") {
      parts.push(`[${segment.element.chipTitle}]`);
    } else if (segment.text.trim()) {
      parts.push(segment.text.trim());
    }
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return "（空消息）";
  if (joined.length <= maxLen) return joined;
  return `${joined.slice(0, maxLen - 1)}…`;
}

/** Clipboard / paste round-trip uses stored markup or legacy action lines. */
export function hasPasteableUserMessageFormat(text: string): boolean {
  if (text.includes("<qkrpc-action-tag")) return true;
  if (text.includes("<qkrpc-browser-element")) return true;
  if (text.includes("<qka-link")) return true;
  if (text.includes("<qka")) return true;
  return /^\[动作:\s*[^\]]+\]\s*actionId=/m.test(text);
}

export function mergePinnedActionTags(
  existing: PinnedAction[],
  incoming: PinnedAction[],
): PinnedAction[] {
  const seen = new Set(existing.map((t) => t.id));
  const merged = [...existing];
  for (const tag of incoming) {
    if (seen.has(tag.id)) continue;
    seen.add(tag.id);
    merged.push(tag);
  }
  return merged;
}
