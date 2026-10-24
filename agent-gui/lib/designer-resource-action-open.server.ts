import { mkdir, readdir, readFile, lstat, realpath, open } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";
import { readDesignerCatalogContext, type DesignerCatalogContext } from "./action-editor/catalog/designerCatalogContext";
import { ActionProjectBindingError, fingerprintActionProjectBinding, sameActionProjectBinding, type ActionProjectBinding } from "./action-project-binding";
import { readActionProjectBinding, readNullableActionProjectBinding, requireActionProjectBinding, validateActionProjectPaths } from "./action-project-host-binding.server";
import { sameHostBinding } from "./qkrpc-host-binding";
import { parseQkrpcJson } from "./qkrpc-json";
import { runQkrpc, type QkrpcRunOptions } from "./qkrpc";
import type { QkrpcRunResult } from "./qkrpc-types";
import { qkrpcRequestContext, runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "./workspace-fs";
import { resolveWorkspacePathChain } from "./workspace-path-chain";
import { workspaceDocumentKey, type WorkspaceDocumentOwner } from "./workspace-document-instances";
import { previewTabId } from "./workbench/preview-tab-id";
import { DESIGNER_RESOURCE_ACTION_OPEN_CAPABILITY, type DesignerResourceActionOpenFailure, type DesignerResourceActionOpenResult,
  type DesignerResourceActionOpenSuccess } from "./designer-resource-action-open";

const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
type Run = (args: string[], options?: QkrpcRunOptions) => Promise<QkrpcRunResult>;
type Input = { actionId: string; requestId: string; sourceOwner: WorkspaceDocumentOwner;
  context: DesignerCatalogContext & { cwd: string; expectedProjectBinding: ActionProjectBinding } };
export type DesignerResourceActionOpenDependencies = { signal?: AbortSignal; run?: Run };
const ownersSymbol = Symbol.for("qkrpc.designerResourceActionOpenOwners.v1");
const ownerGlobal = globalThis as typeof globalThis & { [ownersSymbol]?: Map<string, Promise<DesignerResourceActionOpenResult>> };
const owners = ownerGlobal[ownersSymbol] ??= new Map<string, Promise<DesignerResourceActionOpenResult>>();

async function withOpenOwner(key: string, run: () => Promise<DesignerResourceActionOpenResult>, failure: (error: unknown) => DesignerResourceActionOpenFailure): Promise<DesignerResourceActionOpenResult> {
  const previous = owners.get(key);
  let release!: (result: DesignerResourceActionOpenResult) => void;
  const held = new Promise<DesignerResourceActionOpenResult>((resolveHeld) => { release = resolveHeld; });
  owners.set(key, held);
  let result: DesignerResourceActionOpenResult;
  try {
    const preceding = await previous;
    // A queued click cannot replay another export whose local outcome is still unknown.
    result = preceding && !preceding.ok && (preceding.localPersistence === "unknown" || preceding.localPersistence === "partial")
      ? preceding : await run();
  } catch (error) { result = failure(error); }
  release(result);
  if (owners.get(key) === held) owners.delete(key);
  return result;
}

function fail(code: string, error: string, facts: Partial<Omit<DesignerResourceActionOpenFailure, "ok" | "code" | "error" | "retryable">> = {}): DesignerResourceActionOpenFailure {
  return { ok: false, code, error, retryable: false, localPersistence: "none", ...facts };
}
function parseInput(value: unknown): Input {
  value = structuredClone(value);
  if (!object(value) || typeof value.actionId !== "string" || !guid.test(value.actionId)
    || typeof value.requestId !== "string" || !guid.test(value.requestId))
    throw new ActionProjectBindingError("INVALID_RESOURCE_OPEN_REQUEST", "Canonical actionId and requestId GUIDs are required.");
  const context = readDesignerCatalogContext(value);
  if (!context?.expectedProjectBinding) throw new ActionProjectBindingError("HOST_BINDING_REQUIRED", "A complete bound document context is required.");
  if (!context.cwd || !isAbsolute(context.cwd)) throw new ActionProjectBindingError("INVALID_RESOURCE_OPEN_REQUEST", "An explicit absolute workspace cwd is required.");
  const owner = value.sourceOwner, path = `${context.projectDirectory.replace(/\\/g, "/").replace(/\/+$/, "")}/data.json`;
  if (!object(owner) || typeof owner.instanceId !== "number" || !Number.isSafeInteger(owner.instanceId) || owner.instanceId <= 0
    || owner.cwd !== context.cwd.trim() || owner.path !== path || owner.tabId !== previewTabId("file", path)
    || owner.key !== workspaceDocumentKey(context.cwd, owner.tabId as string))
    throw new ActionProjectBindingError("INVALID_RESOURCE_OPEN_REQUEST", "The exact source workspace file instance is required.");
  return { actionId: value.actionId.toLowerCase(), requestId: value.requestId.toLowerCase(), sourceOwner: owner as WorkspaceDocumentOwner,
    context: { ...context, cwd: context.cwd, expectedProjectBinding: context.expectedProjectBinding } };
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
async function claimPath(path: string) {
  const checked = await resolveWorkspacePathChain(resolveWorkspaceRoot(), resolveWorkspacePath(path), { realpath,
    lstat: async (candidate) => { const metadata = await lstat(candidate);
      if (metadata.isSymbolicLink()) throw new ActionProjectBindingError("UNSAFE_PROJECT_PATH", "Request claims cannot use links or junctions."); return metadata; } });
  if (!checked.ok) throw new ActionProjectBindingError("UNSAFE_PROJECT_PATH", checked.error);
  if (checked.metadata && !checked.metadata.isDirectory() && checked.metadata.nlink !== 1)
    throw new ActionProjectBindingError("UNSAFE_PROJECT_PATH", "Request claim files must have one hard link.");
  return checked;
}
async function claimRequest(input: Input, canonicalCwd: string, directory: string): Promise<{ created: boolean; verify: () => Promise<void> }> {
  const parent = await claimPath(".quicker/.resource-open-requests");
  if (parent.metadata && !parent.metadata.isDirectory()) throw new ActionProjectBindingError("UNSAFE_PROJECT_PATH", "The request claim parent must be a directory.");
  if (!parent.metadata) await mkdir(parent.absolute).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
  await claimPath(".quicker/.resource-open-requests");
  const claim = await claimPath(`.quicker/.resource-open-requests/${input.requestId}.json`);
  const expected = { schemaVersion: 1, cwd: canonicalCwd, sourceOwner: input.sourceOwner,
    sourceProjectDirectory: input.context.projectDirectory, sourceProjectBinding: input.context.expectedProjectBinding,
    target: targetRecord(input), projectDirectory: directory };
  const serialized = canonicalJson(expected);
  const verify = async () => {
    const existing = await claimPath(`.quicker/.resource-open-requests/${input.requestId}.json`), metadata = await lstat(existing.absolute);
    if (!metadata.isFile() || metadata.size > 128_000) throw new ActionProjectBindingError("REQUEST_ID_CONFLICT", "Request provenance is invalid; no export was sent.");
    let record: unknown;
    try { record = JSON.parse(await readFile(existing.absolute, "utf8")); }
    catch { throw new ActionProjectBindingError("OPEN_RESULT_UNKNOWN", "The request claim was not committed. No export was repeated."); }
    if (canonicalJson(record) !== serialized) throw new ActionProjectBindingError("REQUEST_ID_CONFLICT", "This requestId already belongs to another source file or complete target.");
  };
  try {
    const file = await open(claim.absolute, "wx");
    try { await file.writeFile(serialized + "\n", "utf8"); await file.sync(); }
    finally { await file.close(); }
    return { created: true, verify };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await verify();
    return { created: false, verify };
  }
}
function targetRecord(input: Input): ActionProjectBinding {
  return { schemaVersion: 1, kind: "action", actionId: input.actionId, hostBinding: input.context.expectedProjectBinding.hostBinding };
}
async function currentSource(input: Input): Promise<void> {
  const source = input.context.expectedProjectBinding;
  const current = await readActionProjectBinding(input.context.projectDirectory, source.actionId);
  if (!sameActionProjectBinding(source, current)) throw new ActionProjectBindingError("PROJECT_IDENTITY_CONFLICT", "The source document binding changed while opening the action.");
}
async function completedProject(directory: string, expected: ActionProjectBinding): Promise<ActionProjectBinding> {
  const absolute = await validateActionProjectPaths(directory);
  const actual = await readActionProjectBinding(directory, expected.actionId);
  if (!sameActionProjectBinding(actual, expected)) throw new ActionProjectBindingError("PROJECT_IDENTITY_CONFLICT", "The local project belongs to another complete target.");
  for (const leaf of ["info.json", "data.json"]) {
    const file = join(absolute, leaf), metadata = await lstat(file);
    if (!metadata.isFile() || !metadata.size || metadata.nlink !== 1 || !object(parseQkrpcJson(await readFile(file, "utf8"))))
      throw new ActionProjectBindingError("LOCAL_PROJECT_INCOMPLETE", "The local project is incomplete.");
  }
  return actual;
}
async function existingProject(input: Input): Promise<{ directory: string; record: ActionProjectBinding } | undefined> {
  // The verified source is under this same guarded root, so it already exists; no global id-first lookup.
  const sourceAbsolute = await validateActionProjectPaths(input.context.projectDirectory);
  const actionsRoot = resolve(sourceAbsolute, "..");
  const candidates: Array<{ directory: string; record: ActionProjectBinding }> = [];
  for (const entry of await readdir(actionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = `.quicker/actions/${entry.name}`;
    let record: ActionProjectBinding | null;
    try { record = await readNullableActionProjectBinding(directory, input.actionId); }
    catch { continue; } // Invalid/unbound/foreign metadata is never selected or overwritten.
    if (!record || !sameHostBinding(record.hostBinding, input.context.expectedProjectBinding.hostBinding)) continue;
    if (!sameActionProjectBinding(record, targetRecord(input)))
      throw new ActionProjectBindingError("PROJECT_IDENTITY_CONFLICT", "A project for this destination has different complete binding metadata.");
    candidates.push({ directory, record });
  }
  if (candidates.length > 1) throw new ActionProjectBindingError("PROJECT_SELECTION_REQUIRED", "Multiple local projects match this complete target. Choose a workspace file explicitly.");
  return candidates[0];
}
function success(input: Input, directory: string, record: ActionProjectBinding, origin: DesignerResourceActionOpenSuccess["origin"]): DesignerResourceActionOpenSuccess {
  return { ok: true, actionId: input.actionId, projectDirectory: directory, path: `${directory}/data.json`, projectBinding: record,
    localPersistence: origin === "existing" ? "unchanged" : "confirmed", origin };
}
function transportFailure(result: QkrpcRunResult, directory: string): DesignerResourceActionOpenFailure {
  const root = object(result.parsed) ? result.parsed : {};
  const data = object(root.data) ? root.data : root;
  const parts = object(data.persistedParts) ? data.persistedParts : undefined;
  const persistedParts = parts ? { ...(typeof parts.localProject === "boolean" ? { localProject: parts.localProject } : {}),
    ...(typeof parts.binding === "boolean" ? { binding: parts.binding } : {}) } : undefined;
  const code = typeof root.error === "string" && /^[A-Z][A-Z0-9_]+$/.test(root.error) ? root.error : "OPEN_RESULT_UNKNOWN";
  return fail(code, result.stderr || "The export acknowledgement is unavailable. Inspect this owned directory before continuing.", {
    projectDirectory: directory, localPersistence: persistedParts?.localProject ? "partial" : "unknown", ...(persistedParts ? { persistedParts } : {}),
  });
}

/** Opens a local editor project, never mutates a host action, and never repeats a directory's export. */
export async function openDesignerResourceAction(value: unknown, dependencies: DesignerResourceActionOpenDependencies = {}): Promise<DesignerResourceActionOpenResult> {
  let input: Input;
  try { dependencies.signal?.throwIfAborted(); input = parseInput(value); }
  catch (error) { return fail(dependencies.signal?.aborted ? "REQUEST_ABORTED" : error instanceof ActionProjectBindingError ? error.code : "INVALID_RESOURCE_OPEN_REQUEST", error instanceof Error ? error.message : String(error)); }
  const executionState = createTurnExecutionState();
  let directory: string | undefined, dispatched = false, confirmed = false;
  const failure = (error: unknown) => fail(error instanceof ActionProjectBindingError ? error.code : confirmed ? "PROJECT_IDENTITY_CONFLICT" : dispatched ? "OPEN_RESULT_UNKNOWN"
    : dependencies.signal?.aborted ? "REQUEST_ABORTED" : "RESOURCE_OPEN_FAILED",
  error instanceof Error ? error.message : String(error), {
    ...(directory ? { projectDirectory: directory } : {}), localPersistence: confirmed ? "confirmed"
      : dispatched || (error instanceof ActionProjectBindingError && error.code === "OPEN_RESULT_UNKNOWN") ? "unknown" : "none",
    ...(confirmed ? { persistedParts: { localProject: true, binding: true } } : {}),
  });
  try {
    const canonical = await realpath(input.context.cwd);
    const ownerKey = JSON.stringify([process.platform === "win32" ? canonical.toLowerCase() : canonical, fingerprintActionProjectBinding(targetRecord(input))]);
    return await runWithAgentRequestContextAsync({ cwd: input.context.cwd, abortSignal: dependencies.signal, executionState }, async () => {
      dependencies.signal?.throwIfAborted();
      await requireActionProjectBinding(input.context.expectedProjectBinding.actionId, { projectDirectory: input.context.projectDirectory, projectBinding: input.context.expectedProjectBinding });
      const host = input.context.expectedProjectBinding.hostBinding;
      if (host.hostKind !== "v1" || host.capabilities[DESIGNER_RESOURCE_ACTION_OPEN_CAPABILITY] !== true)
        return fail("UNSUPPORTED_HOST", "Opening an action project requires the bound V1 body-read capability.");
      dependencies.signal?.throwIfAborted();
      const ownedDirectory = `.quicker/actions/open-${input.requestId}`;
      const ownedAbsolute = await validateActionProjectPaths(ownedDirectory);
      directory = ownedDirectory;
      const requestClaim = await claimRequest(input, canonical, ownedDirectory);
      dependencies.signal?.throwIfAborted();
      return withOpenOwner(ownerKey, async () => {
      await requestClaim.verify(); await currentSource(input); dependencies.signal?.throwIfAborted();
      const recover = async (): Promise<DesignerResourceActionOpenResult> => {
        directory = ownedDirectory;
        try {
          const record = await completedProject(ownedDirectory, targetRecord(input));
          confirmed = true; await requestClaim.verify(); await currentSource(input);
          return success(input, ownedDirectory, record, "recovered");
        } catch (error) {
          return fail("OPEN_RESULT_UNKNOWN", error instanceof Error ? error.message : String(error), {
            projectDirectory: ownedDirectory, localPersistence: confirmed ? "confirmed" : "unknown",
            ...(confirmed ? { persistedParts: { localProject: true, binding: true } } : {}),
          });
        }
      };
      if (await lstat(ownedAbsolute).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return false; throw error; }))
        return recover();
      if (!requestClaim.created) return fail("OPEN_RESULT_UNKNOWN", "This request was already claimed but its output is unavailable. No export was repeated.", {
        projectDirectory: ownedDirectory, localPersistence: "unknown",
      });
      const existing = await existingProject(input);
      if (existing) {
        const record = await completedProject(existing.directory, targetRecord(input));
        await requestClaim.verify(); await currentSource(input); dependencies.signal?.throwIfAborted();
        return success(input, existing.directory, record, "existing");
      }
      directory = ownedDirectory;
      const absolute = ownedAbsolute;
      dependencies.signal?.throwIfAborted();
      try { await mkdir(absolute); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        return recover();
      }
      // Keep the claimed directory on every outcome. A transport timeout may leave C# completing its export.
      await validateActionProjectPaths(directory); await requestClaim.verify(); await currentSource(input); dependencies.signal?.throwIfAborted();
      const destination = directory;
      // This explicit manual operation now owns completion. The Agent helper intentionally merges parent aborts.
      return qkrpcRequestContext.run({ cwd: input.context.cwd, abortSignal: AbortSignal.timeout(35_000), executionState }, async () => {
        dispatched = true;
        const result = await (dependencies.run ?? runQkrpc)(["action", "extract", "--id", input.actionId, "--dir", absolute, "--no-bootstrap"], {
          hostBinding: host, timeoutMs: 30_000,
        });
        if (!result.ok) return transportFailure(result, destination);
        const root = object(result.parsed) ? result.parsed : undefined;
        const receipt = object(root?.payload) ? root.payload : root;
        if (!receipt || receipt.success !== true || typeof receipt.actionId !== "string" || receipt.actionId.toLowerCase() !== input.actionId
          || typeof receipt.projectDirectoryAbsolute !== "string" || resolve(receipt.projectDirectoryAbsolute) !== resolve(absolute))
          return fail("OPEN_RESULT_UNKNOWN", "The export receipt did not confirm this exact owned directory and action.", { projectDirectory: destination, localPersistence: "unknown" });
        const record = await completedProject(destination, targetRecord(input));
        confirmed = true;
        await requestClaim.verify(); await currentSource(input);
        return success(input, destination, record, "exported");
      });
      }, failure);
    });
  } catch (error) {
    return failure(error);
  } finally { disposeTurnExecutionState(executionState); }
}
