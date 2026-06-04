/** Assistant summary: clickable Quicker action links rendered in chat. */

export const ACTION_LINK_OPS = [
  "run",
  "edit",
  "float",
  "workspace",
] as const;

export type ActionLinkOp = (typeof ACTION_LINK_OPS)[number];

export type ParsedActionLink = {
  actionId: string;
  op: ActionLinkOp;
  label: string;
};

export type AssistantMessageSegment =
  | { type: "text"; text: string }
  | { type: "link"; link: ParsedActionLink };

export type AssistantRenderUnit =
  | { kind: "markdown"; text: string }
  | { kind: "link-bar"; links: ParsedActionLink[] };

/** Whitespace / punctuation between adjacent qka-link tags (not rendered). */
const LINK_SEPARATOR_RE = /^[\s·•|,，、\-–—]*$/;

const QKA_LINK_RE = /<qka-link\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/qka-link>)/gi;

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function normalizeActionId(id: string): string | null {
  const trimmed = id.trim().toLowerCase();
  if (!GUID_RE.test(trimmed)) return null;
  return trimmed;
}

export function parseActionLinkOp(raw: string | undefined): ActionLinkOp | null {
  const op = raw?.trim().toLowerCase();
  if (!op) return null;
  return (ACTION_LINK_OPS as readonly string[]).includes(op)
    ? (op as ActionLinkOp)
    : null;
}

export function defaultActionLinkLabel(op: ActionLinkOp): string {
  switch (op) {
    case "run":
      return "运行";
    case "edit":
      return "编辑";
    case "float":
      return "悬浮";
    case "workspace":
      return "工作区";
  }
}

export function parseActionLinkFromAttrs(
  attrs: Record<string, string>,
  innerText: string,
): ParsedActionLink | null {
  const actionId = normalizeActionId(attrs.id ?? "");
  const op = parseActionLinkOp(attrs.op);
  if (!actionId || !op) return null;

  const label =
    attrs.label?.trim()
    || innerText.trim()
    || defaultActionLinkLabel(op);

  return { actionId, op, label };
}

export function hasAssistantActionLinks(text: string): boolean {
  return /<qka-link\s/i.test(text);
}

export function parseAssistantMessageSegments(
  text: string,
): AssistantMessageSegment[] {
  if (!hasAssistantActionLinks(text)) {
    return text ? [{ type: "text", text }] : [];
  }

  const segments: AssistantMessageSegment[] = [];
  const re = new RegExp(QKA_LINK_RE.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", text: text.slice(last, match.index) });
    }
    const link = parseActionLinkFromAttrs(
      parseHtmlAttrs(match[1]),
      match[2] ?? "",
    );
    if (link) {
      segments.push({ type: "link", link });
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    segments.push({ type: "text", text: text.slice(last) });
  }

  return coalesceTextSegments(segments);
}

export function isLinkSeparatorText(text: string): boolean {
  return LINK_SEPARATOR_RE.test(text);
}

/** Group parsed segments into markdown blocks and one horizontal link bar per run. */
export function groupAssistantRenderUnits(
  segments: AssistantMessageSegment[],
): AssistantRenderUnit[] {
  const units: AssistantRenderUnit[] = [];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i]!;
    if (seg.type === "link") {
      const links: ParsedActionLink[] = [];
      while (i < segments.length) {
        const cur = segments[i]!;
        if (cur.type === "link") {
          links.push(cur.link);
          i++;
          continue;
        }
        if (cur.type === "text" && isLinkSeparatorText(cur.text)) {
          i++;
          continue;
        }
        break;
      }
      if (links.length > 0) {
        units.push({ kind: "link-bar", links });
      }
      continue;
    }

    let text = seg.text;
    i++;
    while (i < segments.length && segments[i]!.type === "text") {
      text += segments[i]!.text;
      i++;
    }
    if (text.trim()) {
      units.push({ kind: "markdown", text });
    }
  }

  return units;
}

function coalesceTextSegments(
  segments: AssistantMessageSegment[],
): AssistantMessageSegment[] {
  const out: AssistantMessageSegment[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      const prev = out[out.length - 1];
      if (prev?.type === "text") {
        prev.text += seg.text;
      } else {
        out.push({ type: "text", text: seg.text });
      }
    } else {
      out.push(seg);
    }
  }
  return out;
}

export function formatActionLinkMarkup(
  actionId: string,
  op: ActionLinkOp,
  label?: string,
): string {
  const id = normalizeActionId(actionId);
  if (!id) {
    throw new Error(`Invalid action id for qka-link: ${actionId}`);
  }
  const text = (label?.trim() || defaultActionLinkLabel(op)).replace(
    /</g,
    "",
  );
  return `<qka-link id="${id}" op="${op}">${text}</qka-link>`;
}

/** Move all link bars to the end (UI fallback when the model misplaces tags). */
export function finalizeAssistantRenderUnits(
  units: AssistantRenderUnit[],
): AssistantRenderUnit[] {
  const leading: AssistantRenderUnit[] = [];
  const links: ParsedActionLink[] = [];

  for (const unit of units) {
    if (unit.kind === "link-bar") {
      links.push(...unit.links);
    } else {
      leading.push(unit);
    }
  }

  if (links.length === 0) {
    return leading;
  }
  return [...leading, { kind: "link-bar", links }];
}

/** Prompt snippet for system instructions (assistant completion summaries). */
export const ACTION_LINK_SUMMARY_PROMPT = `After successfully creating or patching an action (workspace_program_patch / qkrpc_action_patch with target=action), close with a brief text summary then action links — do not paste action tables or repeat full tool JSON.
Placement (required): put every <qka-link> at the **very end** of the message — after all explanation, bullets, and next steps. The UI renders them as one horizontal button bar below your text. Never interleave qka-link inside lists or mid-paragraph.
Format: <qka-link id="{actionGuid}" op="{op}">label</qka-link>. ops: run | edit | float | workspace. Use the real GUID from patch/create. Self-closing with label="…" is OK. Separate tags with · or newlines on the last line only.
Example (links only on the last line):
已完成修改，editVersion 已更新。

<qka-link id="…" op="run">运行</qka-link> · <qka-link id="…" op="edit">Quicker 编辑</qka-link> · <qka-link id="…" op="float">悬浮</qka-link> · <qka-link id="…" op="workspace">工作区</qka-link>`;
