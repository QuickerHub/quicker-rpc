import {
  DesignerCatalogError,
  designerCatalogTargetKey,
  withDesignerCatalogContext,
  type DesignerCatalogScope,
} from "./designerCatalogContext";
import { parseActionProjectBinding, sameActionProjectBinding } from "../../action-project-binding";
import { DESIGNER_RESOURCE_ACTION_OPEN_CAPABILITY, type DesignerResourceActionOpenResult } from "../../designer-resource-action-open";
import type { WorkspaceDocumentOwner } from "../../workspace-document-instances";

type Pending = { controller: AbortController; promise: Promise<unknown>; waiters: number };
const MAX_CACHED_VALUES = 256;

/** Web Crypto randomUUID is limited to secure origins; getRandomValues also covers isolated local fixtures/views. */
export function createResourceActionOpenRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type DesignerCatalogPort = ReturnType<typeof createDesignerCatalogPort>;

function abortReason(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException("Catalog request cancelled", "AbortError");
}

/** One document owns its target, cache and request lifetime; a waiter never owns another waiter's request. */
export function createDesignerCatalogPort(scope: DesignerCatalogScope, fetcher: typeof fetch = fetch) {
  const context = scope == null ? scope : structuredClone(scope);
  const key = designerCatalogTargetKey(context);
  const values = new Map<string, unknown>();
  const pending = new Map<string, Pending>();
  let closed = false;
  const remoteEnabled = context === undefined || (context !== null && context.expectedProjectBinding !== null);
  const documentBound = context !== undefined && context !== null && context.expectedProjectBinding !== null;

  function shared<T>(requestKey: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (closed) return Promise.reject(new DesignerCatalogError("STALE_CATALOG_OWNER", "The document catalog has closed."));
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    let entry = pending.get(requestKey);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, promise: Promise.resolve(), waiters: 0 };
      const owned = entry;
      owned.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then((value) => {
        if (closed || controller.signal.aborted || pending.get(requestKey) !== owned) throw abortReason(controller.signal);
        return value;
      }).finally(() => {
        if (pending.get(requestKey) === owned) pending.delete(requestKey);
      });
      pending.set(requestKey, owned);
    }
    const owned = entry;
    owned.waiters += 1;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (callback: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener("abort", onAbort);
        owned.controller.signal.removeEventListener("abort", onOwnerAbort);
        owned.waiters -= 1;
        if (owned.waiters === 0 && pending.get(requestKey) === owned) {
          pending.delete(requestKey);
          owned.controller.abort();
        }
        callback();
      };
      const onAbort = () => finish(() => reject(abortReason(signal)));
      const onOwnerAbort = () => finish(() => reject(abortReason(owned.controller.signal)));
      signal?.addEventListener("abort", onAbort, { once: true });
      owned.controller.signal.addEventListener("abort", onOwnerAbort, { once: true });
      owned.promise.then((value) => finish(() => resolve(value as T)), (error) => finish(() => reject(error)));
    });
  }

  return {
    key, remoteEnabled, documentBound,
    workspaceCwd: context?.cwd,
    get resourceCallInsertAvailable(): boolean {
      return !closed && documentBound && context?.expectedProjectBinding?.hostBinding.hostKind === "v1"
        && context.expectedProjectBinding.hostBinding.capabilities["resource.globalSubprogram.page.read"] === true;
    },
    get resourceActionOpenAvailable(): boolean {
      return !closed && documentBound && Boolean(context?.cwd) && context?.expectedProjectBinding?.hostBinding.hostKind === "v1"
        && context.expectedProjectBinding.hostBinding.capabilities[DESIGNER_RESOURCE_ACTION_OPEN_CAPABILITY] === true;
    },
    /** Local export has a persistence receipt: do not share, cache, retry, or cancel it when the catalog view hides. */
    async openResourceAction(actionId: string, requestId: string, sourceOwner: WorkspaceDocumentOwner): Promise<DesignerResourceActionOpenResult> {
      const failed = (code: string, error: string, localPersistence: "none" | "unknown" = "none"): DesignerResourceActionOpenResult =>
        ({ ok: false, code, error, retryable: false, localPersistence,
          ...(localPersistence === "unknown" ? { projectDirectory: `.quicker/actions/open-${requestId}` } : {}) });
      if (!this.resourceActionOpenAvailable || !context?.expectedProjectBinding)
        return failed("UNSUPPORTED_HOST", "A bound V1 action body read capability is required to open an action.");
      if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(actionId)
        || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))
        return failed("INVALID_RESOURCE_OPEN_REQUEST", "Action and request ids must be GUIDs.");
      const safeDirectory = (value: unknown): value is string => typeof value === "string"
        && /^\.quicker\/actions\/[^/\\]+$/.test(value) && !/[\0<>:"|?*\r\n]/.test(value) && !value.endsWith("/.") && !value.endsWith("/..");
      try {
        const response = await fetcher("/api/designer/resources/open-action", { method: "POST", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(withDesignerCatalogContext({ actionId, requestId, sourceOwner }, context)) });
        const result = await response.json() as DesignerResourceActionOpenResult;
        if (response.ok && result?.ok === true && result.actionId.toLowerCase() === actionId.toLowerCase()
          && safeDirectory(result.projectDirectory) && result.path === `${result.projectDirectory}/data.json`
          && ["existing", "exported", "recovered"].includes(result.origin) && ["unchanged", "confirmed"].includes(result.localPersistence)) {
          const binding = parseActionProjectBinding(result.projectBinding, actionId);
          if (sameActionProjectBinding(binding, { ...context.expectedProjectBinding, actionId }))
            return { ...result, projectBinding: binding };
        }
        if (result?.ok === false && typeof result.code === "string" && typeof result.error === "string"
          && result.retryable === false && ["none", "partial", "unknown", "confirmed"].includes(result.localPersistence)
          && (result.projectDirectory === undefined || safeDirectory(result.projectDirectory))) {
          const blocked = result.blockedBy;
          if (blocked === undefined) return result;
          if (result.code === "RESOURCE_OPEN_BLOCKED" && result.localPersistence === "none" && result.projectDirectory === undefined && result.persistedParts === undefined
            && blocked && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(blocked.requestId)
            && typeof blocked.actionId === "string" && blocked.actionId.toLowerCase() === actionId.toLowerCase() && typeof blocked.code === "string" && typeof blocked.error === "string"
            && ["partial", "unknown"].includes(blocked.localPersistence) && (blocked.projectDirectory === undefined || safeDirectory(blocked.projectDirectory))
            && blocked.sourceOwner && typeof blocked.sourceOwner.cwd === "string" && typeof blocked.sourceOwner.path === "string"
            && typeof blocked.sourceOwner.key === "string" && typeof blocked.sourceOwner.tabId === "string"
            && Number.isSafeInteger(blocked.sourceOwner.instanceId) && blocked.sourceOwner.instanceId > 0) return result;
        }
        return failed("RESOURCE_OPEN_RESULT_UNKNOWN", "The open receipt is invalid. The export will not be repeated.", "unknown");
      } catch (error) {
        return failed("RESOURCE_OPEN_RESULT_UNKNOWN", `The local export result is unknown: ${error instanceof Error ? error.message : String(error)}. It will not be repeated.`, "unknown");
      }
    },
    supportsCapability(name: string): boolean {
      return !closed && documentBound && context?.expectedProjectBinding?.hostBinding.capabilities[name] === true;
    },
    get<T>(cacheKey: string): T | undefined {
      if (closed || !values.has(cacheKey)) return undefined;
      const value = values.get(cacheKey);
      values.delete(cacheKey);
      values.set(cacheKey, value);
      return value as T;
    },
    set<T>(cacheKey: string, value: T): void {
      if (closed) return;
      values.delete(cacheKey);
      values.set(cacheKey, value);
      if (values.size > MAX_CACHED_VALUES) values.delete(values.keys().next().value!);
    },
    shared,
    async request<T>(path: string, payload: object, signal?: AbortSignal): Promise<T> {
      if (!remoteEnabled) throw new DesignerCatalogError("CATALOG_TARGET_UNAVAILABLE", "This document has no bound catalog target.");
      const body = JSON.stringify(withDesignerCatalogContext(payload, context));
      return shared(`${path}\0${body}`, async (ownedSignal) => {
        const response = await fetcher(path, {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body, signal: ownedSignal,
        });
        const data = await response.json() as T & { ok?: boolean; code?: string; error?: string };
        if (!response.ok || data.ok === false) {
          throw new DesignerCatalogError(data.code ?? "CATALOG_REQUEST_FAILED", data.error ?? `HTTP ${response.status}`, response.status);
        }
        return data;
      }, signal);
    },
    dispose(): void {
      if (closed) return;
      closed = true;
      for (const entry of pending.values()) entry.controller.abort();
      pending.clear();
      values.clear();
    },
  };
}
