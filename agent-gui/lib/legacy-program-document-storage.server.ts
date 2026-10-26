import { lstat, open, realpath } from "node:fs/promises";
import { basename, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fingerprintProgramDocumentContent } from "./action-editor/document/programDocumentWire";
import {
  fingerprintProgramDocumentMetadataContent,
  patchProgramDocumentMetadata,
  readProgramDocumentMetadata,
  validateProgramDocumentMetadataForSave,
} from "./action-editor/document/programDocumentMetadata";
import type { LegacyProgramDocumentSaveRequest as ProgramDocumentSaveRequest, ProgramDocumentSaveResult, ProgramDocumentTargetResult } from "./program-document-save";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import { MAX_UI_READ_BYTES } from "./workspace-file-helpers";
import { resolveWorkspaceRoot, writeWorkspaceFile } from "./workspace-fs";
import { resolveWorkspacePathChain } from "./workspace-path-chain";
import { ACTION_PROJECT_BINDING_PATH, ActionProjectBindingError, parseActionProjectBinding, sameActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
import { readNullableActionProjectBinding, validateActionProjectPaths, withActionProjectLease } from "./action-project-host-binding.server";

const ownerSymbol = Symbol.for("qkrpc.programDocumentWriteOwners.v1");
const ownerGlobal = globalThis as typeof globalThis & { [ownerSymbol]?: Map<string, Promise<void>> };
const owners = ownerGlobal[ownerSymbol] ??= new Map<string, Promise<void>>();
const bodyPathPattern = /^\.quicker\/(?:actions\/[^/]+\/(?:subprograms\/[^/]+\/)?|subprograms\/[^/]+\/)data\.json$/i;
const actionBodyPathPattern = /^\.quicker\/actions\/[^/]+\/data\.json$/i;

class SaveError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function documentPath(root: string, input: string, allowInfo = false): { absolute: string; relative: string } {
  if (!input || input.length > 4096 || /[\0<>"|?*]/.test(input)) throw new SaveError("invalid_path", "A program data.json path is required.");
  const absolute = resolve(root, input);
  const tail = absolute.slice(parse(absolute).root.length);
  if (tail.includes(":")) throw new SaveError("invalid_path", "Alternate data streams are not allowed.");
  let rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new SaveError("invalid_path", "Program documents must stay inside the workspace.");
  rel = rel.replace(/\\/g, "/");
  if (allowInfo && /^\.quicker\/actions\/[^/]+\/info\.json$/i.test(rel)) rel = rel.replace(/info\.json$/i, "data.json");
  if (!bodyPathPattern.test(rel)) throw new SaveError("invalid_path", "Only existing .quicker program data.json documents can be saved.");
  return { absolute: resolve(root, rel), relative: rel };
}

/** The body and its metadata share one HMR-stable queue. Callers still own their validation and CAS. */
export async function withProgramDocumentWriteOwner<T>(path: string, run: () => Promise<T>): Promise<T> {
  const root = await realpath(resolveWorkspaceRoot());
  const target = documentPath(root, path, true);
  let canonical = target.absolute;
  try { canonical = await realpath(target.absolute); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const previous = owners.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((resolveHeld) => { release = resolveHeld; });
  const tail = previous.then(() => held);
  owners.set(key, tail);
  await previous;
  try { return await runWithQkrpcCwdAsync(root, run); }
  finally {
    release();
    if (owners.get(key) === tail) owners.delete(key);
  }
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new SaveError("invalid_request", `${label} must be a string.`);
  if (Buffer.byteLength(value, "utf8") > MAX_UI_READ_BYTES) throw new SaveError("too_large", `${label} exceeds the document size limit.`);
}

function validateRequest(value: unknown): ProgramDocumentSaveRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SaveError("invalid_request", "A program document save request is required.");
  const request = value as Record<string, unknown>;
  if (typeof request.path !== "string") throw new SaveError("invalid_request", "path must be a string.");
  requireText(request.content, "content");
  requireText(request.expectedContent, "expectedContent");
  if (request.metadata !== undefined) {
    if (!request.metadata || typeof request.metadata !== "object" || Array.isArray(request.metadata)) throw new SaveError("invalid_request", "metadata must contain content and expectedContent.");
    const meta = request.metadata as Record<string, unknown>;
    requireText(meta.content, "metadata.content");
    requireText(meta.expectedContent, "metadata.expectedContent");
  }
  return request as ProgramDocumentSaveRequest;
}

async function inspectExistingFile(root: string, path: string) {
  const absolute = resolve(root, path);
  const checked = await resolveWorkspacePathChain(root, { ok: true, absolute, relative: path }, {
    realpath,
    lstat: async (candidate) => {
      const stats = await lstat(candidate);
      if (stats.isSymbolicLink()) throw new SaveError("unsafe_path", "Program document paths cannot contain symbolic links or junctions.");
      return stats;
    },
  });
  if (!checked.ok) throw new SaveError("unsafe_path", checked.error);
  if (!checked.metadata) throw new SaveError("not_found", `Program document does not exist: ${path}`);
  const stats = await lstat(checked.absolute, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink() || stats.nlink !== 1n) throw new SaveError("unsafe_path", "Program documents must be regular files with a single link.");
  if (stats.size > BigInt(MAX_UI_READ_BYTES)) throw new SaveError("too_large", `Program document exceeds the size limit: ${path}`);
  return { absolute: checked.absolute, stats };
}

async function readExistingFile(root: string, path: string): Promise<string> {
  const inspected = await inspectExistingFile(root, path);
  const handle = await open(inspected.absolute, "r");
  try {
    const stats = await handle.stat({ bigint: true });
    // Windows lstat may report dev=0 while fstat reports the volume serial number.
    const differentDevice = stats.dev !== 0n && inspected.stats.dev !== 0n && stats.dev !== inspected.stats.dev;
    if (!stats.isFile() || stats.nlink !== 1n || differentDevice || stats.ino !== inspected.stats.ino) throw new SaveError("unsafe_path", "Program document changed while opening it.");
    if (stats.size > BigInt(MAX_UI_READ_BYTES)) throw new SaveError("too_large", `Program document exceeds the size limit: ${path}`);
    const buffer = Buffer.alloc(MAX_UI_READ_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_UI_READ_BYTES) throw new SaveError("too_large", `Program document exceeds the size limit: ${path}`);
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}

/** Identity is read only from guarded local metadata; no host discovery or RPC is involved. */
async function readProjectBinding(directory: string): Promise<ActionProjectBinding | null> {
  await validateActionProjectPaths(directory);
  let actionId: string | undefined;
  for (const leaf of ["info.json", ACTION_PROJECT_BINDING_PATH]) {
    const path = `${directory}/${leaf}`;
    try {
      const inspected = await inspectExistingFile(resolveWorkspaceRoot(), path);
      if (inspected.stats.size > 128_000n) throw new SaveError("identity_conflict", "Action identity metadata exceeds the size limit.");
      const value = JSON.parse(await readExistingFile(resolveWorkspaceRoot(), path)) as Record<string, unknown>;
      const id = leaf === "info.json" ? value.id ?? value.Id ?? value.ID ?? value.actionId : value.actionId;
      if (typeof id === "string" && id) { actionId = id; break; }
    } catch (error) {
      if (error instanceof SaveError && error.code === "not_found") continue;
      throw error;
    }
  }
  return readNullableActionProjectBinding(directory, actionId ?? basename(directory));
}

async function requireExpectedProjectBinding(directory: string, request: ProgramDocumentSaveRequest): Promise<void> {
  try {
    if (!Object.hasOwn(request, "expectedProjectBinding")) throw new Error("The action document target must be loaded before saving.");
    const current = await readProjectBinding(directory);
    const raw = request.expectedProjectBinding;
    const expected = raw === null ? null : parseActionProjectBinding(raw, raw?.actionId ?? "");
    if (current === null || expected === null ? current !== expected : !sameActionProjectBinding(current, expected)) {
      throw new Error("Action project host binding changed. Reopen the document before saving.");
    }
  } catch (error) {
    throw new SaveError("identity_conflict", error instanceof Error ? error.message : String(error));
  }
}

export async function readProgramDocumentTarget(path: string): Promise<ProgramDocumentTargetResult> {
  try {
    return await withProgramDocumentWriteOwner(path, async () => {
      const root = resolveWorkspaceRoot();
      const target = documentPath(root, path);
      if (!actionBodyPathPattern.test(target.relative)) throw new SaveError("invalid_path", "Only a main action document has a project target.");
      await inspectExistingFile(root, target.relative);
      const directory = target.relative.replace(/\/data\.json$/i, "");
      return withActionProjectLease(directory, async () => ({ ok: true, projectDirectory: directory, projectBinding: await readProjectBinding(directory) }));
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), code: error instanceof SaveError || error instanceof ActionProjectBindingError ? error.code : "identity_read_failed" };
  }
}

function metadataCandidate(content: string, expected: string): void {
  validateProgramDocumentMetadataForSave(content);
  const values = readProgramDocumentMetadata(content);
  // Pad absent presentation fields equally without changing the actual candidate text.
  const allowed = patchProgramDocumentMetadata(expected, values);
  const candidate = patchProgramDocumentMetadata(content, values);
  if (fingerprintProgramDocumentMetadataContent(allowed) !== fingerprintProgramDocumentMetadataContent(candidate)) throw new SaveError("metadata_not_editable", "Only the action title, description and icon may change.");
}

export type ProgramDocumentSaveDependencies = { writeWorkspaceFile?: typeof writeWorkspaceFile };

/** Compare all requested baselines before either write; a later failure never rolls back a persisted part. */
export async function saveProgramDocument(value: unknown, dependencies: ProgramDocumentSaveDependencies = {}): Promise<ProgramDocumentSaveResult> {
  let persistedParts: { body?: boolean; metadata?: boolean } | undefined;
  try {
    const request = validateRequest(value);
    const expectedBody = fingerprintProgramDocumentContent(request.expectedContent);
    const nextBody = fingerprintProgramDocumentContent(request.content);
    let expectedMetadata: string | undefined;
    let nextMetadata: string | undefined;
    if (request.metadata) {
      metadataCandidate(request.metadata.content, request.metadata.expectedContent);
      expectedMetadata = fingerprintProgramDocumentMetadataContent(request.metadata.expectedContent);
      nextMetadata = fingerprintProgramDocumentMetadataContent(request.metadata.content);
    }
    return await withProgramDocumentWriteOwner(request.path, async () => {
      const root = resolveWorkspaceRoot();
      const target = documentPath(root, request.path);
      const mainAction = actionBodyPathPattern.test(target.relative);
      const directory = target.relative.replace(/\/data\.json$/i, "");
      await inspectExistingFile(root, target.relative);
      const persist = async (): Promise<ProgramDocumentSaveResult> => {
      if (mainAction) await requireExpectedProjectBinding(directory, request);
      if (request.metadata && !actionBodyPathPattern.test(target.relative)) throw new SaveError("invalid_path", "Action metadata is only supported beside an action data.json.");
      const metadataPath = target.relative.replace(/data\.json$/i, "info.json");
      const currentBody = await readExistingFile(root, target.relative);
      const currentMetadata = request.metadata ? await readExistingFile(root, metadataPath) : undefined;
      if (fingerprintProgramDocumentContent(currentBody) !== expectedBody) throw new SaveError("body_conflict", "Program body changed on disk. Reload it before saving.");
      if (currentMetadata !== undefined && fingerprintProgramDocumentMetadataContent(currentMetadata) !== expectedMetadata) throw new SaveError("metadata_conflict", "Action metadata changed on disk. Reload it before saving.");
      const write = dependencies.writeWorkspaceFile ?? writeWorkspaceFile;
      const writePart = async (path: string, content: string) => {
        await inspectExistingFile(root, path);
        try {
          const result = await write(path, content, { createDirs: false });
          if (!result.ok) throw new SaveError("write_failed", result.error);
        } catch (error) { throw error instanceof SaveError ? error : new SaveError("write_failed", error instanceof Error ? error.message : String(error)); }
      };
      if (nextBody !== expectedBody) await writePart(target.relative, request.content);
      persistedParts = { body: true };
      if (request.metadata) {
        if (mainAction) await requireExpectedProjectBinding(directory, request);
        // An external writer can change metadata while the body is being written.
        const latestMetadata = await readExistingFile(root, metadataPath);
        if (fingerprintProgramDocumentMetadataContent(latestMetadata) !== expectedMetadata) throw new SaveError("metadata_conflict", "Action metadata changed while saving the program body.");
        if (nextMetadata !== expectedMetadata) await writePart(metadataPath, request.metadata.content);
        persistedParts.metadata = true;
      }
      return { ok: true };
      };
      return mainAction ? withActionProjectLease(directory, persist) : persist();
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error),
      code: error instanceof SaveError ? error.code : error instanceof ActionProjectBindingError ? (error.code === "PROJECT_BUSY" ? "project_busy" : "identity_conflict") : "save_failed", ...(persistedParts ? { persistedParts } : {}) };
  }
}
