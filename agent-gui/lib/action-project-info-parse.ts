import { basenamePath } from "@/lib/workspace-file-tool";

export type ActionProjectInfoKind = "action" | "subprogram";

export type ParsedActionProjectInfo = {
  kind: ActionProjectInfoKind;
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  icon?: string;
  callIdentifier?: string;
  editVersion?: number;
  exportedUtc?: string;
  /** Keys present in JSON but not mapped to known fields. */
  extra: Record<string, unknown>;
};

export type ParseActionProjectInfoResult =
  | { ok: true; data: ParsedActionProjectInfo }
  | { ok: false; error: string };

/** Keys rendered in the info editor header / description — never show again in field list. */
export function isPromotedInfoJsonKey(key: string): boolean {
  return /^(id|title|name|description|icon|callidentifier|editversion|exportedutc)$/i.test(
    key.trim(),
  );
}

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

export function parseActionProjectInfo(content: string): ParseActionProjectInfoResult {
  const trimmed = stripJsonBom(content).trim();
  if (!trimmed) {
    return { ok: false, error: "文件为空" };
  }

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
    if (!isPromotedInfoJsonKey(key)) extra[key] = value;
  }

  const callIdentifier = pickString(record, "callIdentifier", "CallIdentifier");
  const name = pickString(record, "name", "Name");
  const title = pickString(record, "title", "Title");
  const kind: ActionProjectInfoKind =
    callIdentifier || (name && !title) ? "subprogram" : "action";

  return {
    ok: true,
    data: {
      kind,
      id: pickString(record, "id", "Id"),
      title,
      name,
      description: pickString(record, "description", "Description"),
      icon: pickString(record, "icon", "Icon"),
      callIdentifier,
      editVersion: pickLong(record, "editVersion", "EditVersion"),
      exportedUtc: pickString(record, "exportedUtc", "ExportedUtc"),
      extra,
    },
  };
}

/** Display title for explorer / project list (local info.json only). */
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

export function formatExportedUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export type InfoJsonTextField = "title" | "name" | "description";

function preferJsonKey(record: Record<string, unknown>, pascal: string, camel: string): string {
  if (pascal in record) return pascal;
  if (camel in record) return camel;
  return pascal;
}

export function patchActionProjectInfoText(
  content: string,
  field: InfoJsonTextField,
  value: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "文件为空" };
  }

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
  const keyByField: Record<InfoJsonTextField, [string, string]> = {
    title: ["Title", "title"],
    name: ["Name", "name"],
    description: ["Description", "description"],
  };
  const [pascal, camel] = keyByField[field];
  record[preferJsonKey(record, pascal, camel)] = value;

  const trailingNewline = content.endsWith("\n");
  const next = `${JSON.stringify(record, null, 2)}${trailingNewline ? "\n" : ""}`;
  return { ok: true, content: next };
}
