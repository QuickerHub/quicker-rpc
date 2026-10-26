import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { getRequestAbortSignal } from "./qkrpc-request-context";

export class SourceDocumentOwnerError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
type Lease = { directory: string; token: string; ownerKey: string };
const symbol = Symbol.for("qkrpc.sourceDocumentOwners.v1");
const shared = globalThis as typeof globalThis & { [symbol]?: { leases: Map<string, Lease>; tail: Promise<void> } };
const state = shared[symbol] ??= { leases: new Map(), tail: Promise.resolve() };

/** Only ownership and operation ordering live here. APDE remains the sole document and history. */
async function serialized<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const previous = state.tail;
  let release!: () => void;
  state.tail = new Promise<void>(done => { release = done; });
  await previous;
  try { signal?.throwIfAborted(); return await run(); }
  finally { release(); }
}
async function canonical(path: string): Promise<string> {
  let candidate = resolve(path);
  const rest: string[] = [];
  for (;;) {
    try {
      const found = resolve(await realpath(candidate), ...rest.reverse());
      return process.platform === "win32" ? found.toLowerCase() : found;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || dirname(candidate) === candidate) throw error;
      rest.push(candidate.slice(dirname(candidate).length + (dirname(candidate).endsWith(sep) ? 0 : 1)));
      candidate = dirname(candidate);
    }
  }
}
function contains(lease: Lease, path: string, directory: boolean): boolean {
  const ownerBelow = relative(path, lease.directory).replace(/\\/g, "/");
  if (directory && (ownerBelow === "" || (ownerBelow !== ".." && !ownerBelow.startsWith("../") && !isAbsolute(ownerBelow)))) return true;
  const rel = relative(lease.directory, path).replace(/\\/g, "/");
  if (directory && rel === "") return true;
  if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return false;
  return rel === "program.source.yaml" || rel === "quicker.source.json" || rel === ".qkrpc/baseline.json" || rel.startsWith("files/") || (directory && (rel === "files" || rel === ".qkrpc"));
}

export async function claimSourceDocumentOwner<T>(directory: string, ownerKey: string,
  inspect: () => Promise<T>, signal?: AbortSignal): Promise<{ token: string; value: T; release(): void }> {
  return serialized(async () => {
    signal?.throwIfAborted();
    const key = await canonical(directory); signal?.throwIfAborted();
    const lease: Lease = { directory: key, token: randomUUID(), ownerKey };
    // Compare writable footprints, not whole directories: ordinary non-resource nested projects remain independent.
    if ([...state.leases.values()].some(existing => contains(existing, resolve(key, "program.source.yaml"), false)
      || contains(lease, resolve(existing.directory, "program.source.yaml"), false))) {
      throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_OPEN", "此源码包与已打开文档的正文或资源重叠，请使用原文档或先关闭它。");
    }
    state.leases.set(key, lease);
    const release = () => { if (state.leases.get(key) === lease) state.leases.delete(key); };
    try {
      const value = await inspect(); signal?.throwIfAborted();
      return { token: lease.token, value, release };
    } catch (error) { release(); throw error; }
  }, signal);
}

export async function withSourceDocumentOwner<T>(directory: string, token: string, run: (isCurrent: () => boolean) => Promise<T>, signal = getRequestAbortSignal()): Promise<T> {
  return serialized(async () => {
    const key = await canonical(directory), lease = state.leases.get(key);
    signal?.throwIfAborted();
    if (!lease || !token || lease.token !== token) throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_STALE", "原源码文档已关闭或被替换，请重新打开后再操作。");
    return run(() => state.leases.get(key) === lease);
  }, signal);
}

/** Shared by normal Agent writes/direct action.save and the existing generic workspace write API. */
export async function withExternalSourceDocumentWrite<T>(path: string, run: () => Promise<T>, directory = false, signal = getRequestAbortSignal()): Promise<T> {
  return serialized(async () => {
    const target = await canonical(path);
    signal?.throwIfAborted();
    if ([...state.leases.values()].some(lease => contains(lease, target, directory))) {
      throw new SourceDocumentOwnerError("SOURCE_DOCUMENT_OPEN", "该源码包正由设计器持有；请在原设计器中编辑并使用其保存/同步流程，不能独立覆盖 YAML、资源或 checkpoint。");
    }
    signal?.throwIfAborted(); return run();
  }, signal);
}
