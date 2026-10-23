import { lstat, realpath, readdir, readFile, mkdir, open, unlink, link } from "node:fs/promises";
import { basename, join, parse } from "node:path";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "./workspace-fs";
import { resolveWorkspacePathChain } from "./workspace-path-chain";
import { getRequestAbortSignal } from "./qkrpc-request-context";
import { bindQkrpcTarget, configuredQkrpcBinding, currentQkrpcTarget, sameHostBinding, type QkrpcHostBinding } from "./qkrpc-host-binding";
import { ACTION_PROJECT_BINDING_PATH, ActionProjectBindingError, parseActionProjectBinding, sameActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
import type { ActionProjectSyncTarget } from "./action-project-sync-target";
import { resolveQkrpcHttpBase } from "./qkrpc-http";
import { parseQkrpcJson } from "./qkrpc-json";

export { ACTION_PROJECT_BINDING_PATH, ActionProjectBindingError, parseActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
const LEASE_FILE = ".qkrpc-project.lock";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function fail(code: string, message: string): never { throw new ActionProjectBindingError(code, message); }
export function actionProjectBindingFailure(error: unknown) {
  return { error: error instanceof Error ? error.message : String(error),
    ...(error instanceof ActionProjectBindingError ? { code: error.code } : {}), retryable: false as const };
}

function requireDirectoryActionId(directory: string, actionId: string): void {
  const name = basename(directory).trim();
  // .NET also recognizes N/B/P/X GUID directory names. Compare the simple forms
  // and reserve X notation rather than let a later C# fallback identify another action.
  if (/^\{\s*0x/i.test(name))
    fail("HOST_BINDING_MISMATCH", "Use a canonical GUID or descriptive project directory instead of X GUID notation.");
  const hex = name.replace(/^[{(]|[})]$/g, "").replace(/-/g, "");
  if (/^[a-f0-9]{32}$/i.test(hex) && hex.toLowerCase() !== actionId.replace(/-/g, "").toLowerCase())
    fail("HOST_BINDING_MISMATCH", "The GUID project directory identifies another action.");
}

async function inspect(path: string) {
  const lexical = resolveWorkspacePath(path);
  if (!lexical.ok) fail("UNSAFE_PROJECT_PATH", lexical.error);
  if (lexical.absolute.slice(parse(lexical.absolute).root.length).includes(":")) fail("UNSAFE_PROJECT_PATH", "Alternate data streams are not allowed.");
  const checked = await resolveWorkspacePathChain(resolveWorkspaceRoot(), lexical, {
    realpath,
    lstat: async (candidate) => {
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) fail("UNSAFE_PROJECT_PATH", "Project paths cannot use links or junctions.");
      return stat;
    },
  }, getRequestAbortSignal());
  if (!checked.ok) fail("UNSAFE_PROJECT_PATH", checked.error);
  if (checked.metadata && !checked.metadata.isDirectory() && (checked.metadata.nlink ?? 1) !== 1)
    fail("UNSAFE_PROJECT_PATH", "Project files must have a single hard link.");
  return checked;
}

export async function validateActionProjectPaths(directory: string): Promise<string> {
  const checked = await inspect(directory);
  if (!/^\.quicker\/actions\/[^/]+$/i.test(checked.relative.replace(/\\/g, "/"))) fail("UNSAFE_PROJECT_PATH", "An action project directory is required.");
  for (const leaf of ["info.json", "data.json", ".qkrpc", ACTION_PROJECT_BINDING_PATH]) await inspect(join(directory, leaf));
  return checked.absolute;
}

export async function guardActionProjectBindingWrite(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const checked = await inspect(path);
    if (/(?:^|\/)\.qkrpc\/project-binding\.json$/i.test(checked.absolute.replace(/\\/g, "/")))
      return { ok: false, error: "project-binding.json is tool-managed and cannot be edited through file writes." };
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
}

export async function readNullableActionProjectBinding(directory: string, actionId: string): Promise<ActionProjectBinding | null> {
  await validateActionProjectPaths(directory);
  requireDirectoryActionId(directory, actionId);
  const path = await inspect(join(directory, ACTION_PROJECT_BINDING_PATH));
  const info = await inspect(join(directory, "info.json"));
  if (info.metadata) {
    const infoStat = await lstat(info.absolute);
    if (!infoStat.isFile() || infoStat.size > 128_000) fail("HOST_HANDSHAKE_INVALID", "Project identity metadata is invalid.");
    const parsed = parseQkrpcJson(await readFile(info.absolute, "utf8")) as Record<string, unknown>;
    for (const key of ["id", "Id", "ID", "actionId"]) {
      const id = parsed[key];
      if (typeof id === "string" && id.toLowerCase() !== actionId.toLowerCase()) fail("HOST_BINDING_MISMATCH", "Project metadata and binding identify different actions.");
    }
  }
  if (!path.metadata) return null;
  const stat = await lstat(path.absolute);
  if (!stat.isFile() || stat.size > 128_000) fail("HOST_HANDSHAKE_INVALID", "Project binding is invalid.");
  return parseActionProjectBinding(JSON.parse(await readFile(path.absolute, "utf8")), actionId);
}

export async function readActionProjectBinding(directory: string, actionId: string): Promise<ActionProjectBinding> {
  return await readNullableActionProjectBinding(directory, actionId)
    ?? fail("HOST_BINDING_REQUIRED", "This disk project has no verified host binding. Reopen explicitly into a new directory.");
}

/** This lookup reads only guarded local identity metadata; ambiguous GUID matches never pick the first directory. */
export async function findActionProjectBinding(actionId: string): Promise<{ directory: string; record: ActionProjectBinding } | undefined> {
  if (!uuid.test(actionId)) fail("INVALID_ACTION_ID", "Action id must be a GUID.");
  const root = await inspect(".quicker/actions");
  if (!root.metadata) return;
  const candidates: string[] = [];
  for (const entry of await readdir(root.absolute, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = `.quicker/actions/${entry.name}`;
    await validateActionProjectPaths(directory);
    let matches = entry.name.toLowerCase() === actionId.toLowerCase();
    for (const leaf of [ACTION_PROJECT_BINDING_PATH, "info.json"]) {
      const path = await inspect(join(directory, leaf));
      if (!path.metadata) continue;
      const stat = await lstat(path.absolute);
      if (!stat.isFile() || stat.size > 128_000) continue;
      const value = parseQkrpcJson(await readFile(path.absolute, "utf8")) as Record<string, unknown>;
      const id = value.actionId ?? value.id ?? value.Id ?? value.ID;
      if (typeof id === "string" && id.toLowerCase() === actionId.toLowerCase()) matches = true;
    }
    if (matches) candidates.push(directory);
  }
  if (candidates.length > 1) fail("PROJECT_SELECTION_REQUIRED", "Multiple disk projects identify this action; no host was contacted.");
  if (!candidates.length) return;
  return { directory: candidates[0]!, record: await readActionProjectBinding(candidates[0]!, actionId) };
}

/** Persisted provenance takes precedence over discovery, but a fresh explicit conflicting selection is an error. */
export function pinActionProjectBinding(binding: QkrpcHostBinding): void {
  const current = currentQkrpcTarget();
  if (current) {
    if (!sameHostBinding(current.binding, binding)) fail("HOST_BINDING_MISMATCH", "This turn and disk project belong to different host sessions.");
    return;
  }
  const configured = configuredQkrpcBinding();
  if (configured && "exitCode" in configured) fail("HOST_HANDSHAKE_INVALID", configured.stderr);
  const selected = process.env.QKRPC_HOST_SESSION?.trim();
  if ((configured && !sameHostBinding(configured, binding)) || (selected && selected !== binding.hostSessionId))
    fail("HOST_BINDING_MISMATCH", "The explicit host selection differs from this disk project.");
  bindQkrpcTarget({ gateway: process.env.QKRPC_TRANSPORT?.trim().toLowerCase() === "cli" ? "cli" : resolveQkrpcHttpBase(), binding });
}

export async function requireActionProjectBinding(actionId: string, target?: ActionProjectSyncTarget) {
  const existing = target ? { directory: target.projectDirectory, record: await readActionProjectBinding(target.projectDirectory, actionId) }
    : await findActionProjectBinding(actionId);
  if (!existing) fail("HOST_BINDING_REQUIRED", "No bound disk project exists for this action.");
  if (target && !sameActionProjectBinding(existing.record, target.projectBinding)) fail("PROJECT_IDENTITY_CONFLICT", "The document target differs from the current project binding.");
  pinActionProjectBinding(existing.record.hostBinding);
  return existing;
}

export async function pinExistingActionProjectBinding(actionId: string): Promise<void> {
  const existing = await findActionProjectBinding(actionId);
  if (existing) pinActionProjectBinding(existing.record.hostBinding);
}

export async function withBoundActionProject<T>(actionId: string, run: (directory: string, record: ActionProjectBinding) => Promise<T>, target?: ActionProjectSyncTarget): Promise<T> {
  const existing = await requireActionProjectBinding(actionId, target);
  pinActionProjectBinding(existing.record.hostBinding);
  const { withProgramDocumentWriteOwner } = await import("./program-document-save.server");
  return withProgramDocumentWriteOwner(join(existing.directory, "data.json"), async () => {
    const verified = await requireActionProjectBinding(actionId, target ?? { projectDirectory: existing.directory, projectBinding: existing.record });
    return run(verified.directory, verified.record);
  });
}

/** Called under the existing document owner. The shared create-new lease also excludes direct CLI exports. */
export async function withActionProjectLease<T>(directory: string, run: (absoluteDirectory: string) => Promise<T>): Promise<T> {
  const absolute = await validateActionProjectPaths(directory);
  await mkdir(absolute, { recursive: true });
  const leasePath = join(absolute, LEASE_FILE);
  const lease = await open(leasePath, "wx").catch(() => fail("PROJECT_BUSY", "Another process owns this project export."));
  try {
    const ownedLease = await lease.stat({ bigint: true });
    try { return await run(absolute); }
    finally {
      const current = await lstat(leasePath, { bigint: true }).catch(() => undefined);
      // Never unlink a replacement lease. A crashed Node export leaves its file fail-closed.
      // Windows path lstat reports dev=0 while fstat reports the volume serial.
      if (current?.ino === ownedLease.ino && (process.platform === "win32" || current.dev === ownedLease.dev)) await unlink(leasePath);
    }
  } finally { await lease.close(); }
}

export async function withActionProjectBootstrap<T>(directory: string, actionId: string, binding: QkrpcHostBinding, write: () => Promise<T>): Promise<T> {
  requireDirectoryActionId(directory, actionId);
  return withActionProjectLease(directory, async (absolute) => {
    const entries = (await readdir(absolute)).filter((entry) => entry !== LEASE_FILE);
    if (entries.length) {
      const existing = await readActionProjectBinding(directory, actionId);
      if (!sameHostBinding(existing.hostBinding, binding)) fail("HOST_BINDING_MISMATCH", "This project belongs to another host session.");
      fail("PROJECT_ALREADY_EXISTS", "Create bootstrap cannot replace an existing project.");
    }
    const result = await write();
    let temporary: string | undefined;
    try {
      const sidecar = await inspect(join(directory, ACTION_PROJECT_BINDING_PATH));
      await mkdir(join(absolute, ".qkrpc"), { recursive: true });
      temporary = `${sidecar.absolute}.${crypto.randomUUID()}.tmp`;
      const file = await open(temporary, "wx");
      try { await file.writeFile(JSON.stringify({ schemaVersion: 1, kind: "action", actionId, hostBinding: binding } satisfies ActionProjectBinding) + "\n", "utf8"); }
      finally { await file.close(); }
      await link(temporary, sidecar.absolute);
    } catch (error) {
      getRequestAbortSignal()?.throwIfAborted();
      throw new ActionProjectBindingError("PROJECT_BINDING_WRITE_FAILED", `Local project files were written, but binding was not committed: ${String(error)}`, { localProject: true, binding: false });
    } finally { if (temporary) await unlink(temporary).catch(() => {}); }
    return result;
  });
}
