import { basenamePath } from "@/lib/workspace-file-tool";
import {
  editVersionToNumber,
  formatActionProjectInfoProto,
  parseActionProjectInfoProto,
  patchActionProjectInfoProtoText,
  type ActionProjectInfo,
} from "@/lib/action-project-info";

export type { ActionProjectInfo };

export type ActionProjectInfoKind = "action" | "subprogram";

/** View model for the structured info editor (actions use proto; subprograms stay JSON). */
export type ParsedActionProjectInfo = {
  kind: ActionProjectInfoKind;
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  icon?: string;
  callIdentifier?: string;
  editVersion?: number;
  /** Subprogram-only extra JSON fields. */
  extra: Record<string, unknown>;
};

export type ParseActionProjectInfoResult =
  | { ok: true; data: ParsedActionProjectInfo }
  | { ok: false; error: string };

export type InfoJsonTextField = "title" | "name" | "description";

export function isActionProjectInfoPath(path: string): boolean {
  return basenamePath(path).toLowerCase() === "info.json";
}

export function stripJsonBom(content: string): string {
  return content.replace(/^\uFEFF/, "");
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function pickLong(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function actionInfoToParsed(data: ActionProjectInfo): ParsedActionProjectInfo {
  return {
    kind: "action",
    id: data.id?.trim() || undefined,
    title: data.title?.trim() || undefined,
    description: data.description?.trim() || undefined,
    icon: data.icon?.trim() || undefined,
    editVersion: editVersionToNumber(data.editVersion),
    extra: {},
  };
}

function parseSubProgramInfo(content: string): ParseActionProjectInfoResult {
  const trimmed = stripJsonBom(content).trim();
  if (!trimmed) return { ok: false, error: "文件为空" };

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : "无效的 JSON";
    return { ok: false, error: message };
  }

  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, error: "info.json 必须是 JSON 对象" };
  }

  const record = obj as Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      /^(id|title|name|description|icon|callidentifier|editversion|exportedutc)$/i.test(
        key.trim(),
      )
    ) {
      continue;
    }
    extra[key] = value;
  }

  const callIdentifier = pickString(record, "callIdentifier", "CallIdentifier");
  const name = pickString(record, "name", "Name");
  const title = pickString(record, "title", "Title");

  return {
    ok: true,
    data: {
      kind: "subprogram",
      id: pickString(record, "id", "Id"),
      title,
      name,
      description: pickString(record, "description", "Description"),
      icon: pickString(record, "icon", "Icon"),
      callIdentifier,
      editVersion: pickLong(record, "editVersion", "EditVersion"),
      extra,
    },
  };
}

export function parseActionProjectInfo(content: string): ParseActionProjectInfoResult {
  const trimmed = stripJsonBom(content).trim();
  if (!trimmed) return { ok: false, error: "文件为空" };

  let peek: unknown;
  try {
    peek = JSON.parse(trimmed) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : "无效的 JSON";
    return { ok: false, error: message };
  }

  if (typeof peek !== "object" || peek === null || Array.isArray(peek)) {
    return { ok: false, error: "info.json 必须是 JSON 对象" };
  }

  const record = peek as Record<string, unknown>;
  const callIdentifier = pickString(record, "callIdentifier", "CallIdentifier");
  const name = pickString(record, "name", "Name");
  const title = pickString(record, "title", "Title");
  const isSubprogram =
    Boolean(callIdentifier)
    || (Boolean(name) && !title)
    || record.kind === "subprogram";

  if (isSubprogram) {
    return parseSubProgramInfo(content);
  }

  const proto = parseActionProjectInfoProto(content);
  if (!proto.ok) return proto;
  return { ok: true, data: actionInfoToParsed(proto.data) };
}

export function actionProjectDisplayTitle(
  data: ParsedActionProjectInfo,
): string | undefined {
  if (data.kind === "action") {
    return data.title ?? data.name;
  }
  return data.name ?? data.title;
}

export function projectDirNameFromInfoPath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const file = parts[parts.length - 1]?.toLowerCase();
  if (file !== "info.json") return undefined;
  return parts[parts.length - 2];
}

function preferJsonKey(record: Record<string, unknown>, pascal: string, camel: string): string {
  if (pascal in record) return pascal;
  if (camel in record) return camel;
  return camel;
}

export function patchActionProjectInfoText(
  content: string,
  field: InfoJsonTextField,
  value: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "文件为空" };

  let peek: unknown;
  try {
    peek = JSON.parse(trimmed) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : "无效的 JSON";
    return { ok: false, error: message };
  }

  if (typeof peek !== "object" || peek === null || Array.isArray(peek)) {
    return { ok: false, error: "info.json 必须是 JSON 对象" };
  }

  const record = peek as Record<string, unknown>;
  const callIdentifier = pickString(record, "callIdentifier", "CallIdentifier");
  const name = pickString(record, "name", "Name");
  const title = pickString(record, "title", "Title");
  const isSubprogram = Boolean(callIdentifier) || (Boolean(name) && !title);

  if (isSubprogram) {
    const keyByField: Record<InfoJsonTextField, [string, string]> = {
      title: ["Title", "title"],
      name: ["Name", "name"],
      description: ["Description", "description"],
    };
    const [pascal, camel] = keyByField[field];
    record[preferJsonKey(record, pascal, camel)] = value;
    return {
      ok: true,
      content: `${JSON.stringify(record, null, 2)}${content.endsWith("\n") ? "\n" : ""}`,
    };
  }

  if (field === "title" || field === "description") {
    return patchActionProjectInfoProtoText(content, field, value);
  }

  return { ok: false, error: `Unsupported field: ${field}` };
}

export { formatActionProjectInfoProto };
