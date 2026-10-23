import { readProgramDocumentMetadata, validateProgramDocumentMetadataForSave, type ProgramDocumentMetadata } from "./action-editor/document/programDocumentMetadata";
import type { QkrpcRunResult } from "./qkrpc-types";

export function normalizeActionProjectSyncVersion(value: unknown): string | undefined {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) return undefined;
  if (typeof value !== "number" && typeof value !== "string" && typeof value !== "bigint") return undefined;
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) return undefined;
  const number = BigInt(text);
  return number > 0n && number <= 9223372036854775807n ? number.toString() : undefined;
}

/** Replace version tokens only. Unknown JSON and legacy numeric Int64s never pass through JSON.stringify. */
export function stampActionProjectInfoVersion(content: string, version: unknown): string {
  const normalized = normalizeActionProjectSyncVersion(version);
  if (!normalized) throw new Error("A precise positive editVersion is required");
  const raw: unknown = JSON.parse(content.replace(/^\uFEFF/, ""));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("info.json must be a JSON object");
  const tokens = [...content.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)];
  let depth = 0;
  let closing = 0;
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token[0] === "{" || token[0] === "[") { depth++; continue; }
    if (token[0] === "}" || token[0] === "]") { if (depth === 1) closing = token.index!; depth--; continue; }
    if (depth !== 1 || !token[0].startsWith('"') || tokens[i + 1]?.[0] !== ":") continue;
    const key = JSON.parse(token[0]) as string;
    if (key !== "editVersion" && key !== "EditVersion") continue;
    if (seen.has(key)) throw new Error("info.json has duplicate editVersion keys");
    seen.add(key);
    const value = tokens[i + 2]!;
    const stringValue = value[0].startsWith('"');
    if (!normalizeActionProjectSyncVersion(stringValue ? JSON.parse(value[0]) : value[0]) && value[0] !== "0" && value[0] !== '"0"') throw new Error("info.json editVersion must be an integer or integer string");
    replacements.push({ start: value.index!, end: value.index! + value[0].length, text: stringValue ? JSON.stringify(normalized) : normalized });
  }
  if (!replacements.length) replacements.push({ start: closing, end: closing, text: `${Object.keys(raw).length ? "," : ""}\n  "editVersion": ${JSON.stringify(normalized)}\n` });
  let next = content;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) next = next.slice(0, replacement.start) + replacement.text + next.slice(replacement.end);
  return next;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function payload(result: QkrpcRunResult): Record<string, unknown> | undefined {
  const root = record(result.parsed);
  return record(root?.payload) ?? root;
}

function confirmed(result: QkrpcRunResult): boolean {
  return result.ok && result.exitCode === 0 && record(result.parsed)?.ok !== false && payload(result)?.success === true;
}

function errorMessage(result: QkrpcRunResult, fallback: string): string {
  const data = payload(result);
  for (const value of [data?.errorMessage, data?.error, data?.message, record(result.parsed)?.message, result.stderr]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function editVersion(result: QkrpcRunResult): string | undefined {
  const data = payload(result);
  return normalizeActionProjectSyncVersion(data?.editVersion ?? data?.EditVersion);
}

function preserveCancellation(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (error instanceof Error && error.name === "AbortError") throw error;
}

function remoteMetadata(result: QkrpcRunResult): ProgramDocumentMetadata {
  const data = payload(result);
  const compressed = data?.compressed ?? data?.Compressed;
  const raw = typeof compressed === "string" ? compressed : JSON.stringify(record(compressed));
  if (!raw) throw new Error("Quicker did not return action metadata");
  const parsed = record(JSON.parse(raw));
  if (!parsed || !["title", "Title"].some((key) => Object.hasOwn(parsed, key))) throw new Error("Quicker did not return an action title");
  return readProgramDocumentMetadata(raw);
}

export type ActionProjectHostSyncResult =
  | { ok: true; bodyResult: QkrpcRunResult; metadataResult?: QkrpcRunResult; editVersion?: string }
  | { ok: false; phase: "metadata-read" | "apply" | "metadata" | "version-stamp"; error: string; persistedParts: { body?: boolean; metadata?: boolean }; bodyResult?: QkrpcRunResult; metadataResult?: QkrpcRunResult };

/** An explicit workspace Sync: read presentation, save body, then update changed presentation with the new CAS version. */
export async function syncActionProjectBodyAndMetadata(
  options: { actionId: string; infoContent: string; applyArgs: string[] },
  ports: { run: (args: string[]) => Promise<QkrpcRunResult>; stampVersion: (version: string) => Promise<void>; signal?: AbortSignal },
): Promise<ActionProjectHostSyncResult> {
  ports.signal?.throwIfAborted();
  let local: ProgramDocumentMetadata;
  let remote: ProgramDocumentMetadata;
  try {
    validateProgramDocumentMetadataForSave(options.infoContent);
    local = readProgramDocumentMetadata(options.infoContent);
    const read = await ports.run(["action", "get", "--id", options.actionId, "--return-mode", "metadata", "--json"]);
    if (!confirmed(read)) throw new Error(errorMessage(read, "读取 Quicker 动作属性失败，未写入正文"));
    remote = remoteMetadata(read);
  } catch (error) {
    preserveCancellation(error, ports.signal);
    return { ok: false, phase: "metadata-read", error: error instanceof Error ? error.message : String(error), persistedParts: {} };
  }
  const changes: Partial<ProgramDocumentMetadata> = {};
  if (local.title.trim() !== remote.title.trim()) changes.title = local.title.trim();
  if (local.description !== remote.description) changes.description = local.description;
  if (local.icon.trim() !== remote.icon.trim()) changes.icon = local.icon.trim();

  let bodyResult: QkrpcRunResult;
  ports.signal?.throwIfAborted();
  try { bodyResult = await ports.run(options.applyArgs); }
  catch (error) { preserveCancellation(error, ports.signal); return { ok: false, phase: "apply", error: error instanceof Error ? error.message : String(error), persistedParts: {} }; }
  ports.signal?.throwIfAborted();
  if (!confirmed(bodyResult)) return { ok: false, phase: "apply", error: errorMessage(bodyResult, "Quicker 未确认正文保存成功"), persistedParts: {}, bodyResult };
  const bodyVersion = editVersion(bodyResult);
  if (!bodyVersion) return { ok: false, phase: "version-stamp", error: "正文已写入，但响应缺少精确的新版本；未提交属性或更新本地版本。请核对后重新拉取", persistedParts: { body: true }, bodyResult };
  let finalVersion: string | undefined = bodyVersion;
  let metadataResult: QkrpcRunResult | undefined;
  let failed: string | undefined;
  if (Object.keys(changes).length) {
    const args = ["action", "set-metadata", "--id", options.actionId, "--expected-edit-version", bodyVersion, "--json"];
    for (const key of ["title", "description", "icon"] as const) if (changes[key] !== undefined) args.push(`--${key}`, changes[key]!);
    try {
      metadataResult = await ports.run(args);
      if (!confirmed(metadataResult)) failed = `正文已写入，属性保存未确认：${errorMessage(metadataResult, "属性提交失败")}。请核对后再同步`;
      else {
        finalVersion = editVersion(metadataResult);
        if (!finalVersion) failed = "正文和属性已写入，但属性响应缺少精确的新版本；请重新拉取后再同步";
      }
    } catch (error) { preserveCancellation(error, ports.signal); failed = `正文已写入，属性保存未确认：${error instanceof Error ? error.message : String(error)}。请核对后再同步`; }
  }
  ports.signal?.throwIfAborted();
  const metadataPersisted = metadataResult !== undefined && confirmed(metadataResult);
  // info.editVersion and sync-trust describe the whole project, not a partial body checkpoint.
  // Any unconfirmed metadata write may also have reached the host; never certify the earlier body version.
  if (failed) return { ok: false, phase: "metadata", error: failed, persistedParts: { body: true, ...(metadataPersisted ? { metadata: true } : {}) }, bodyResult, metadataResult };
  const stamp = finalVersion;
  ports.signal?.throwIfAborted();
  if (stamp) {
    try { await ports.stampVersion(stamp); }
    catch (error) {
      preserveCancellation(error, ports.signal);
      return { ok: false, phase: "version-stamp", error: `${failed ? `${failed}；` : ""}Quicker 已写入，但本地版本更新失败：${error instanceof Error ? error.message : String(error)}。请重新拉取`, persistedParts: { body: true, ...(metadataPersisted ? { metadata: true } : {}) }, bodyResult, metadataResult };
    }
  }
  return { ok: true, bodyResult, metadataResult, editVersion: finalVersion };
}
