import { parseActionProjectBinding, type ActionProjectBinding } from "../../action-project-binding";
import { actionProjectSyncTargetKey, normalizeProjectDirectory } from "../../action-project-sync-target";

export type DesignerCatalogContext = {
  cwd?: string;
  projectDirectory: string;
  expectedProjectBinding: ActionProjectBinding | null;
};

/** Undefined preserves independent legacy clients; null means document identity is still loading. */
export type DesignerCatalogScope = DesignerCatalogContext | null | undefined;
export type DesignerCatalogEnvelope = { catalogContext?: DesignerCatalogContext | null };

export class DesignerCatalogError extends Error {
  readonly retryable = false;
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "DesignerCatalogError";
  }
}

/** Presence is significant: malformed or unresolved document contexts never become legacy discovery. */
export function readDesignerCatalogContext(envelope: unknown): DesignerCatalogScope {
  if (!envelope || typeof envelope !== "object" || !Object.hasOwn(envelope, "catalogContext")) return undefined;
  const context = (envelope as DesignerCatalogEnvelope).catalogContext;
  if (context === null) return null;
  if (!context || typeof context !== "object" || Array.isArray(context)
    || typeof context.projectDirectory !== "string" || !context.projectDirectory.trim()
    || (context.cwd !== undefined && (typeof context.cwd !== "string" || !context.cwd.trim()))
    || !Object.hasOwn(context, "expectedProjectBinding")) {
    throw new DesignerCatalogError("INVALID_CATALOG_CONTEXT", "A complete document catalog context is required.", 400);
  }
  const candidate = context.expectedProjectBinding;
  const binding = candidate === null ? null : parseActionProjectBinding(candidate, candidate?.actionId ?? "");
  return { ...(context.cwd === undefined ? {} : { cwd: context.cwd }),
    projectDirectory: context.projectDirectory, expectedProjectBinding: binding };
}

export function withDesignerCatalogContext<T extends object>(payload: T, context: DesignerCatalogScope): T & DesignerCatalogEnvelope {
  return context === undefined ? { ...payload } : { ...payload, catalogContext: context };
}

/** Include workspace and complete provenance; reuse the document's canonical binding fingerprint. */
export function designerCatalogTargetKey(context: DesignerCatalogScope): string {
  if (context === undefined) return "legacy";
  if (context === null) return "identity-loading";
  const target = context.expectedProjectBinding
    ? actionProjectSyncTargetKey({ projectDirectory: context.projectDirectory, projectBinding: context.expectedProjectBinding })
    : JSON.stringify(["unbound", normalizeProjectDirectory(context.projectDirectory)]);
  return JSON.stringify([normalizeProjectDirectory(context.cwd ?? ""), target]);
}

export function designerCatalogFailure(error: unknown): { ok: false; error: string; code: string; retryable: false } {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : "CATALOG_REQUEST_FAILED";
  return { ok: false, error: error instanceof Error ? error.message : String(error), code, retryable: false };
}
