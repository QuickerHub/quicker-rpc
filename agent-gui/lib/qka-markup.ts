/** Shared Quicker action reference markup (<qka> / <qka-link>). */

import { formatActionIdShort } from "@/lib/action-patch-followup";

/** Model-facing inline action/subprogram reference. */
export const QKA_REF_TAG = "qka" as const;

/** UI action chip bar with explicit operations. */
export const QKA_LINK_TAG = "qka-link" as const;

export const QKA_REF_RE = /<qka\s+([^>]*?)>([\s\S]*?)<\/qka>/gi;

export const QKA_LINK_RE =
  /<qka-link\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/qka-link>)/gi;

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QkaRefKind = "action" | "subprogram";

export type ParsedQkaRef = {
  actionId: string;
  title: string;
  kind: QkaRefKind;
  callIdentifier?: string;
};

export function normalizeActionId(id: string): string | null {
  const trimmed = id.trim().toLowerCase();
  if (!GUID_RE.test(trimmed)) return null;
  return trimmed;
}

function decodeAttrValue(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function parseHtmlAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrStr)) !== null) {
    attrs[match[1]] = decodeAttrValue(match[2]);
  }
  return attrs;
}

export function parseQkaRefFromAttrs(
  attrs: Record<string, string>,
  innerText: string,
): ParsedQkaRef | null {
  const actionId = normalizeActionId(attrs.id ?? "");
  if (!actionId) return null;
  const kind: QkaRefKind =
    attrs.kind?.trim().toLowerCase() === "subprogram" ? "subprogram" : "action";
  const title = innerText.trim() || formatActionIdShort(actionId);
  const callIdentifier = attrs.call?.trim() || undefined;
  return { actionId, title, kind, callIdentifier };
}

export function hasQkaRefMarkup(text: string): boolean {
  return /<qka\s/i.test(text);
}

export function hasQkaLinkMarkup(text: string): boolean {
  return /<qka-link\s/i.test(text);
}

export function hasAnyQkaMarkup(text: string): boolean {
  return hasQkaRefMarkup(text) || hasQkaLinkMarkup(text);
}

export type QkaMarkupMatch =
  | {
      index: number;
      length: number;
      kind: "ref";
      attrs: Record<string, string>;
      innerText: string;
    }
  | {
      index: number;
      length: number;
      kind: "link";
      attrs: Record<string, string>;
      innerText: string;
    };

/** Collect <qka> and <qka-link> matches in document order. */
export function findQkaMarkupMatches(text: string): QkaMarkupMatch[] {
  const matches: QkaMarkupMatch[] = [];

  const refRe = new RegExp(QKA_REF_RE.source, "gi");
  let refMatch: RegExpExecArray | null;
  while ((refMatch = refRe.exec(text)) !== null) {
    matches.push({
      index: refMatch.index,
      length: refMatch[0].length,
      kind: "ref",
      attrs: parseHtmlAttrs(refMatch[1]),
      innerText: refMatch[2] ?? "",
    });
  }

  const linkRe = new RegExp(QKA_LINK_RE.source, "gi");
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(text)) !== null) {
    matches.push({
      index: linkMatch.index,
      length: linkMatch[0].length,
      kind: "link",
      attrs: parseHtmlAttrs(linkMatch[1]),
      innerText: linkMatch[2] ?? "",
    });
  }

  matches.sort((a, b) => a.index - b.index);
  return matches;
}
