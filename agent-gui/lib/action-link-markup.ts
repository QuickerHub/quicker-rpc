/** Assistant summary: clickable Quicker action links rendered in chat. */

export const ACTION_LINK_OPS = [
  "run",
  "debug",
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

const ACTION_LINK_OP_ALIASES: Record<string, ActionLinkOp> = {
  folat: "float",
  floating: "float",
  workspace_edit: "workspace",
  ws: "workspace",
};

export function parseActionLinkOp(raw: string | undefined): ActionLinkOp | null {
  const op = raw?.trim().toLowerCase();
  if (!op) return null;
  const mapped = ACTION_LINK_OP_ALIASES[op] ?? op;
  return (ACTION_LINK_OPS as readonly string[]).includes(mapped)
    ? (mapped as ActionLinkOp)
    : null;
}

/** Comma/space-separated ops from `use="run,edit,float"`. */
export function parseActionLinkUseList(raw: string | undefined): ActionLinkOp[] {
  if (!raw?.trim()) return [];
  const ops: ActionLinkOp[] = [];
  for (const part of raw.split(/[,，\s·•|]+/)) {
    const op = parseActionLinkOp(part);
    if (op && !ops.includes(op)) {
      ops.push(op);
    }
  }
  return ops;
}

function parseActionLinkLabelsList(
  raw: string | undefined,
  opCount: number,
): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const labels = raw.split(/[,，]/).map((s) => s.trim());
  if (labels.length !== opCount) return undefined;
  return labels;
}

export function defaultActionLinkLabel(op: ActionLinkOp): string {
  switch (op) {
    case "run":
      return "运行";
    case "debug":
      return "调试";
    case "edit":
      return "编辑";
    case "float":
      return "悬浮";
    case "workspace":
      return "工作区";
  }
}

export function parseActionLinksFromAttrs(
  attrs: Record<string, string>,
  innerText: string,
): ParsedActionLink[] {
  const actionId = normalizeActionId(attrs.id ?? "");
  if (!actionId) return [];

  const useOps = parseActionLinkUseList(attrs.use);
  if (useOps.length > 0) {
    const labelOverrides = parseActionLinkLabelsList(attrs.labels, useOps.length);
    return useOps.map((op, index) => ({
      actionId,
      op,
      label:
        labelOverrides?.[index]
        || defaultActionLinkLabel(op),
    }));
  }

  const single = parseActionLinkFromAttrs(attrs, innerText);
  return single ? [single] : [];
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
    const links = parseActionLinksFromAttrs(
      parseHtmlAttrs(match[1]),
      match[2] ?? "",
    );
    for (const link of links) {
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

    if (seg.type !== "text") {
      i++;
      continue;
    }
    let text = seg.text;
    i++;
    while (i < segments.length) {
      const next = segments[i]!;
      if (next.type !== "text") break;
      text += next.text;
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

/** One tag → horizontal button bar (preferred in assistant summaries). */
export function formatActionLinkBarMarkup(
  actionId: string,
  ops: readonly ActionLinkOp[] = ACTION_LINK_OPS,
  labels?: readonly string[],
): string {
  const id = normalizeActionId(actionId);
  if (!id) {
    throw new Error(`Invalid action id for qka-link: ${actionId}`);
  }
  if (ops.length === 0) {
    throw new Error("At least one action link op is required.");
  }
  const use = ops.join(",");
  if (labels?.length) {
    if (labels.length !== ops.length) {
      throw new Error("labels count must match ops count.");
    }
    const escaped = labels.map((l) => l.replace(/"/g, ""));
    return `<qka-link id="${id}" use="${use}" labels="${escaped.join(",")}"/>`;
  }
  return `<qka-link id="${id}" use="${use}"/>`;
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
export const ACTION_LINK_SUMMARY_PROMPT = `After successfully patching an action (workspace_program_patch / qkrpc_action_patch with target=action), close with a brief text summary (what changed, editVersion, next steps). Do not output <qka-link> tags, action tables, or repeat full tool JSON — agent-gui automatically shows an action shortcut card at the end of the turn from successful patch tool results (run / edit / float / workspace + 调试).`;
