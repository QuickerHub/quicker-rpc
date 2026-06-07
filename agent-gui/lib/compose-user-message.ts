import type { PinnedAction } from "@/lib/action-context";
import { formatActionQkaForModel } from "@/lib/action-qka-prompt";
import { normalizeActionId } from "@/lib/action-link-markup";
import { formatActionIdShort } from "@/lib/action-patch-followup";

/** Stored in chat history; expanded to {@link formatActionQkaForModel} before the model. */
const ACTION_TAG_RE = new RegExp(
  "<qkrpc-action-tag\\s+([^>]*?)\\s*(?:/>|></qkrpc-action-tag>)",
  "gi",
);

const QKA_LINK_TAG_RE =
  /<qka-link\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/qka-link>)/gi;

const INLINE_USER_MARKUP_RE = new RegExp(
  `${ACTION_TAG_RE.source}|${QKA_LINK_TAG_RE.source}`,
  "gi",
);

const LEGACY_ACTION_LINE_RE =
  /^\[动作:\s*([^\]]+)\]\s*actionId=([^\s,]+)(?:,\s*lastEdit=([^\n,]+))?/;

function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function decodeAttrValue(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function parseHtmlAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrStr)) !== null) {
    attrs[match[1]] = decodeAttrValue(match[2]);
  }
  return attrs;
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
  if (!text.includes("<qkrpc-action-tag") && !text.includes("<qka-link")) {
    return text.trim();
  }

  let expandedAny = false;
  const expanded = text
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

function segmentFromInlineMarkupMatch(match: RegExpExecArray): UserMessageSegment | null {
  if (match[1] !== undefined) {
    const action = pinnedActionFromTagAttrs(parseHtmlAttrs(match[1]));
    return action ? { type: "tag", action } : null;
  }
  if (match[2] !== undefined) {
    const action = pinnedActionFromQkaLinkAttrs(
      parseHtmlAttrs(match[2]),
      match[3] ?? "",
    );
    return action ? { type: "tag", action } : null;
  }
  return null;
}

function parseInlineTagSegments(text: string): UserMessageSegment[] {
  const segments: UserMessageSegment[] = [];
  const re = new RegExp(INLINE_USER_MARKUP_RE.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", text: text.slice(last, match.index) });
    }
    const segment = segmentFromInlineMarkupMatch(match);
    if (segment) segments.push(segment);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", text: text.slice(last) });
  }
  return segments;
}

/** Ordered inline segments (tags may appear anywhere in the text). */
export function parseUserMessageSegments(text: string): UserMessageSegment[] {
  if (!text) return [];

  if (text.includes("<qkrpc-action-tag") || text.includes("<qka-link")) {
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
      || (s.type === "text" && s.text.trim().length > 0),
  );
}

/** Clipboard / paste round-trip uses stored markup or legacy action lines. */
export function hasPasteableUserMessageFormat(text: string): boolean {
  if (text.includes("<qkrpc-action-tag")) return true;
  if (text.includes("<qka-link")) return true;
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
