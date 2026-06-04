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

/** Prompt snippet for system instructions (assistant completion summaries). */
export const ACTION_LINK_SUMMARY_PROMPT = `After successfully creating or patching an action (workspace_program_patch / qkrpc_action_patch with target=action), end your reply with a one-line summary and inline action links — do not paste action tables or repeat full tool JSON.
Use <qka-link id="{actionGuid}" op="{op}">label</qka-link> (paired tags). ops: run | edit | float | workspace. Example:
已完成修改。<qka-link id="…" op="run">运行</qka-link> · <qka-link id="…" op="edit">Quicker 编辑</qka-link> · <qka-link id="…" op="float">悬浮</qka-link> · <qka-link id="…" op="workspace">工作区</qka-link>
Use the real action GUID from the patch/create response. Self-closing with label="…" is also accepted.`;
