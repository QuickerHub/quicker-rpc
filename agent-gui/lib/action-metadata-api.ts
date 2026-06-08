import {
  actionProjectInfoFromMetadataGet,
  editVersionToNumber,
} from "@/lib/action-project-info";
import type { ParsedActionProjectInfo } from "@/lib/action-project-info-parse";
import { parseActionProjectInfo } from "@/lib/action-project-info-parse";
import { resolveActionProjectIconSpec } from "@/lib/action-project-icon";

export type ActionMetadataSnapshot = {
  id: string;
  title: string;
  description?: string;
  icon: string;
  editVersion?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isActionMetadataId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function unwrapGetPayload(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;
  if (typeof root.payload === "object" && root.payload !== null) {
    return root.payload as Record<string, unknown>;
  }
  if (typeof root.data === "object" && root.data !== null) {
    const data = root.data as Record<string, unknown>;
    if (typeof data.payload === "object" && data.payload !== null) {
      return data.payload as Record<string, unknown>;
    }
    return data;
  }
  return root;
}

/** Parse `action get --return-mode metadata` JSON envelope. */
export function parseActionMetadataFromGetJson(
  actionId: string,
  parsed: unknown,
): ActionMetadataSnapshot | null {
  const payload = unwrapGetPayload(parsed);
  if (!payload) return null;

  const info = actionProjectInfoFromMetadataGet(actionId.trim(), payload);
  const id = String(info.id ?? actionId).trim().toLowerCase();
  if (!isActionMetadataId(id)) return null;

  const title = String(info.title ?? "").trim() || "(无标题)";
  const description = String(info.description ?? "").trim() || undefined;
  const icon = resolveActionProjectIconSpec(String(info.icon ?? "").trim());
  const editVersion = editVersionToNumber(info.editVersion);

  return {
    id,
    title,
    description,
    icon,
    editVersion,
  };
}

/** Build metadata snapshot from parsed on-disk info.json. */
export function parseActionMetadataFromParsedInfo(
  actionId: string,
  data: ParsedActionProjectInfo,
): ActionMetadataSnapshot | null {
  if (data.kind !== "action") return null;

  const id = String(data.id ?? actionId).trim().toLowerCase();
  if (!isActionMetadataId(id)) return null;

  const title = String(data.title ?? "").trim() || "(无标题)";
  const description = String(data.description ?? "").trim() || undefined;
  const icon = resolveActionProjectIconSpec(String(data.icon ?? "").trim());
  const editVersion = data.editVersion;

  return {
    id,
    title,
    description,
    icon,
    editVersion,
  };
}

/** Parse workspace info.json text into ActionMetadataSnapshot. */
export function parseActionMetadataFromInfoJson(
  actionId: string,
  content: string,
): ActionMetadataSnapshot | null {
  const parsed = parseActionProjectInfo(content);
  if (!parsed.ok) return null;
  return parseActionMetadataFromParsedInfo(actionId, parsed.data);
}
