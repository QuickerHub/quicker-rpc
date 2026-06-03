import {
  create,
  fromJson,
  toJson,
  type JsonValue,
} from "@bufbuild/protobuf";
import { timestampFromDate, timestampNow } from "@bufbuild/protobuf/wkt";
import {
  ActionProjectInfoSchema,
  type ActionProjectInfo,
} from "@/lib/gen/action_project_pb";
import { readCompressedFromGetPayload } from "@/lib/action-project-info-from-get";

export type { ActionProjectInfo };

export function editVersionToNumber(
  editVersion: bigint | undefined,
): number | undefined {
  if (editVersion === undefined) return undefined;
  const n = Number(editVersion);
  return Number.isFinite(n) ? n : undefined;
}

/** Build proto info from `action get --return-mode metadata` (title/description/icon only). */
export function actionProjectInfoFromMetadataGet(
  actionId: string,
  payload: Record<string, unknown>,
): ActionProjectInfo {
  const compressed = readCompressedFromGetPayload(payload);
  const editVersionRaw = payload.editVersion ?? payload.EditVersion;
  const editVersion =
    typeof editVersionRaw === "number" && Number.isFinite(editVersionRaw)
      ? BigInt(Math.trunc(editVersionRaw))
      : 0n;

  return create(ActionProjectInfoSchema, {
    id:
      (typeof payload.actionId === "string" && payload.actionId.trim())
      || actionId.trim(),
    title: String(compressed?.title ?? compressed?.Title ?? ""),
    description: String(
      compressed?.description ?? compressed?.Description ?? "",
    ),
    icon: String(compressed?.icon ?? compressed?.Icon ?? ""),
    editVersion,
    exportedUtc: timestampNow(),
  });
}

function legacyJsonToProtoJson(root: Record<string, unknown>): JsonValue {
  if (root.compressed && typeof root.compressed === "object") {
    return toJson(
      ActionProjectInfoSchema,
      actionProjectInfoFromMetadataGet(
        String(root.actionId ?? root.ActionId ?? root.id ?? root.Id ?? ""),
        root,
      ),
    ) as JsonValue;
  }

  const editVersionRaw = root.editVersion ?? root.EditVersion ?? 0;
  const editVersion =
    typeof editVersionRaw === "number" && Number.isFinite(editVersionRaw)
      ? BigInt(Math.trunc(editVersionRaw))
      : 0n;

  const exportedRaw = root.exportedUtc ?? root.ExportedUtc;
  let exportedUtc = undefined;
  if (typeof exportedRaw === "string" && exportedRaw.trim()) {
    const date = new Date(exportedRaw);
    if (!Number.isNaN(date.getTime())) {
      exportedUtc = timestampFromDate(date);
    }
  }

  return toJson(
    ActionProjectInfoSchema,
    create(ActionProjectInfoSchema, {
      id: String(root.id ?? root.Id ?? root.actionId ?? root.ActionId ?? ""),
      title: String(root.title ?? root.Title ?? ""),
      description: String(root.description ?? root.Description ?? ""),
      icon: String(root.icon ?? root.Icon ?? ""),
      editVersion,
      exportedUtc,
    }),
  ) as JsonValue;
}

export function parseActionProjectInfoProto(
  content: string,
): { ok: true; data: ActionProjectInfo } | { ok: false; error: string } {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { ok: false, error: "文件为空" };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed) as unknown;
  } catch (e) {
    const message = e instanceof Error ? e.message : "无效的 JSON";
    return { ok: false, error: message };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "info.json 必须是 JSON 对象" };
  }

  const record = raw as Record<string, unknown>;
  try {
    const data = fromJson(ActionProjectInfoSchema, record as JsonValue);
    return { ok: true, data };
  } catch {
    try {
      const data = fromJson(
        ActionProjectInfoSchema,
        legacyJsonToProtoJson(record),
      );
      return { ok: true, data };
    } catch (e) {
      const message = e instanceof Error ? e.message : "无法解析 info.json";
      return { ok: false, error: message };
    }
  }
}

export function formatActionProjectInfoProto(
  info: ActionProjectInfo,
  trailingNewline = true,
): string {
  const json = toJson(ActionProjectInfoSchema, info);
  return `${JSON.stringify(json, null, 2)}${trailingNewline ? "\n" : ""}`;
}

export function patchActionProjectInfoProtoText(
  content: string,
  field: "title" | "description",
  value: string,
): { ok: true; content: string } | { ok: false; error: string } {
  const parsed = parseActionProjectInfoProto(content);
  if (!parsed.ok) return parsed;

  const next = { ...parsed.data };
  if (field === "title") next.title = value;
  else next.description = value;

  return {
    ok: true,
    content: formatActionProjectInfoProto(
      create(ActionProjectInfoSchema, next),
      content.endsWith("\n"),
    ),
  };
}
