import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { fingerprintProgramDocumentContent, parseProgramDocumentSnapshot, programDocumentFingerprint, serializeProgramDocumentSnapshot } from "./programDocumentWire";
import { fingerprintProgramDocumentMetadataContent, patchProgramDocumentMetadata, readProgramDocumentMetadata, validateProgramDocumentMetadataForSave, type ProgramDocumentMetadataPatch } from "./programDocumentMetadata";

/** Identity is supplied by the storage/host adapter; a disk-only document has no invented host. */
export type ProgramDocumentIdentity = {
  documentKey: string;
  host?: { kind: string; instanceId: string; actionId: string; version?: string };
  storage?: { key: string; version?: string };
};

export type ProgramDocumentChangeSource = "ui" | "agent";
export type ProgramDocumentMetadataSource = { path: string; content: string };
export type ProgramDocumentMetadataState = Readonly<ProgramDocumentMetadataSource & { baselineContent: string; dirty: boolean }>;
export type ProgramDocumentPersistedParts = { body?: boolean; metadata?: boolean };

export type ProgramDocumentState = Readonly<{
  baselineContent: string;
  content: string;
  revision: number;
  bodyDirty: boolean;
  dirty: boolean;
  saving: boolean;
  identity: Readonly<ProgramDocumentIdentity>;
  lastChangeSource?: ProgramDocumentChangeSource;
  metadata?: ProgramDocumentMetadataState;
}>;

export type ProgramDocumentFailureCode = "revision_conflict" | "identity_conflict" | "metadata_conflict" | "invalid_document" | "save_in_progress" | "stale_save" | "save_failed" | "closed";
export type ProgramDocumentFailure = { ok: false; code: ProgramDocumentFailureCode; error: string; state: ProgramDocumentState; persisted?: boolean; persistedParts?: ProgramDocumentPersistedParts };
export type ProgramDocumentEditResult = { ok: true; changed: boolean; state: ProgramDocumentState } | ProgramDocumentFailure;
export type ProgramDocumentEditOptions = {
  expectedRevision: number;
  expectedIdentity?: ProgramDocumentIdentity;
  source: ProgramDocumentChangeSource;
};

export type ProgramDocumentSaveTicket = Readonly<{
  saveId: number;
  revision: number;
  content: string;
  baselineContent: string;
  identity: Readonly<ProgramDocumentIdentity>;
  metadata?: Readonly<ProgramDocumentMetadataSource & { baselineContent: string }>;
}>;

export type ProgramDocumentSaveOutcome =
  | { ok: true; identity?: ProgramDocumentIdentity }
  | { ok: false; error?: string; persisted?: boolean; persistedParts?: ProgramDocumentPersistedParts };

function fingerprintContent(content: string): string {
  return fingerprintProgramDocumentContent(content);
}

function immutableIdentity(identity: ProgramDocumentIdentity): Readonly<ProgramDocumentIdentity> {
  const cloned = structuredClone(identity);
  if (!cloned.documentKey.trim()) throw new Error("Program document requires a documentKey");
  if (cloned.host) Object.freeze(cloned.host);
  if (cloned.storage) Object.freeze(cloned.storage);
  return Object.freeze(cloned);
}

function sameIdentity(a: ProgramDocumentIdentity, b: ProgramDocumentIdentity): boolean {
  return programDocumentFingerprint(a) === programDocumentFingerprint(b);
}

function sameTarget(a: ProgramDocumentIdentity, b: ProgramDocumentIdentity): boolean {
  const target = (identity: ProgramDocumentIdentity) => ({
    documentKey: identity.documentKey,
    ...(identity.host ? { host: { kind: identity.host.kind, instanceId: identity.host.instanceId, actionId: identity.host.actionId } } : {}),
    ...(identity.storage ? { storage: { key: identity.storage.key } } : {}),
  });
  return sameIdentity(target(a), target(b));
}

function metadataState(source: ProgramDocumentMetadataSource, baselineContent = source.content): ProgramDocumentMetadataState {
  if (!source.path.trim()) throw new Error("Action metadata requires a path");
  const dirty = fingerprintProgramDocumentMetadataContent(source.content) !== fingerprintProgramDocumentMetadataContent(baselineContent);
  return Object.freeze({ ...source, baselineContent, dirty });
}

export function createProgramDocumentSession(initial: { content: string; identity: ProgramDocumentIdentity; metadata?: ProgramDocumentMetadataSource }) {
  // Validate the complete editing projection before exposing a writable session.
  parseProgramDocumentSnapshot(initial.content);
  let baselineFingerprint = fingerprintContent(initial.content);
  let contentFingerprint = baselineFingerprint;
  let state: ProgramDocumentState = Object.freeze({
    baselineContent: initial.content,
    content: initial.content,
    revision: 0,
    bodyDirty: false,
    dirty: false,
    saving: false,
    identity: immutableIdentity(initial.identity),
    ...(initial.metadata ? { metadata: metadataState(initial.metadata) } : {}),
  });
  let pending: ProgramDocumentSaveTicket | undefined;
  let preparingSave = false;
  let nextSaveId = 1;
  let closed = false;

  const failure = (code: ProgramDocumentFailureCode, error: string, persisted?: boolean, persistedParts?: ProgramDocumentPersistedParts): ProgramDocumentFailure => ({
    ok: false, code, error, state, ...(persisted === undefined ? {} : { persisted }), ...(persistedParts === undefined ? {} : { persistedParts: { ...persistedParts } }),
  });
  const withDirty = (next: ProgramDocumentState): ProgramDocumentState => {
    const bodyDirty = contentFingerprint !== baselineFingerprint;
    return Object.freeze({ ...next, bodyDirty, dirty: bodyDirty || next.metadata?.dirty === true });
  };
  const checkEdit = (options: ProgramDocumentEditOptions): ProgramDocumentFailure | undefined => {
    if (closed) return failure("closed", "Program document session is closed");
    if (options.expectedRevision !== state.revision) return failure("revision_conflict", "Program document changed; read the current revision before editing");
    if (options.expectedIdentity && !sameIdentity(options.expectedIdentity, state.identity)) {
      return failure("identity_conflict", "Program document storage or host identity changed");
    }
    return undefined;
  };
  const commit = (nextContent: string, source: ProgramDocumentChangeSource): ProgramDocumentEditResult => {
    const nextFingerprint = fingerprintContent(nextContent);
    if (nextFingerprint === contentFingerprint) return { ok: true, changed: false, state };
    contentFingerprint = nextFingerprint;
    state = withDirty({ ...state, content: nextContent, revision: state.revision + 1, lastChangeSource: source });
    return { ok: true, changed: true, state };
  };

  const applySnapshot = (snapshot: ActionProgramSnapshot, options: ProgramDocumentEditOptions): ProgramDocumentEditResult => {
    const rejected = checkEdit(options);
    if (rejected) return rejected;
    try {
      return commit(serializeProgramDocumentSnapshot(state.content, snapshot), options.source);
    } catch (error) {
      return failure("invalid_document", error instanceof Error ? error.message : String(error));
    }
  };

  return {
    /** Cached immutable state is safe for React external-store/state comparisons. */
    getState: (): ProgramDocumentState => state,
    readSnapshot: (): ActionProgramSnapshot => parseProgramDocumentSnapshot(state.content),
    readMetadata: () => state.metadata ? readProgramDocumentMetadata(state.metadata.content) : null,
    /** Attach a sibling source without replacing body drafts; external changes never overwrite metadata edits. */
    reconcileMetadataSource: (source: ProgramDocumentMetadataSource): ProgramDocumentEditResult => {
      if (closed) return failure("closed", "Program document session is closed");
      if (state.metadata && source.path !== state.metadata.path) return failure("identity_conflict", "Action metadata belongs to a different path");
      try {
        const next = metadataState(source);
        const incoming = fingerprintProgramDocumentMetadataContent(source.content);
        const current = state.metadata;
        if (current && (incoming === fingerprintProgramDocumentMetadataContent(current.baselineContent)
          || (pending?.metadata && incoming === fingerprintProgramDocumentMetadataContent(pending.metadata.content)))) {
          return { ok: true, changed: false, state };
        }
        if (current && (current.dirty || pending?.metadata)) return failure("metadata_conflict", "Action metadata changed externally; resolve the conflict before saving");
        state = withDirty({ ...state, metadata: next, revision: state.revision + 1 });
        return { ok: true, changed: true, state };
      } catch (error) {
        return failure("invalid_document", error instanceof Error ? error.message : String(error));
      }
    },
    /** Presentation edits use the same optimistic revision as body transactions. */
    applyMetadata: (patch: ProgramDocumentMetadataPatch, options: ProgramDocumentEditOptions): ProgramDocumentEditResult => {
      const rejected = checkEdit(options);
      if (rejected) return rejected;
      if (!state.metadata) return failure("invalid_document", "Action metadata is not attached to this document");
      try {
        const nextContent = patchProgramDocumentMetadata(state.metadata.content, patch);
        if (fingerprintProgramDocumentMetadataContent(nextContent) === fingerprintProgramDocumentMetadataContent(state.metadata.content)) return { ok: true, changed: false, state };
        state = withDirty({ ...state, metadata: metadataState({ path: state.metadata.path, content: nextContent }, state.metadata.baselineContent), revision: state.revision + 1, lastChangeSource: options.source });
        return { ok: true, changed: true, state };
      } catch (error) {
        return failure("invalid_document", error instanceof Error ? error.message : String(error));
      }
    },
    /** A file watcher can observe our write before the storage promise resolves. */
    isSaveAcknowledgement: (content: string): boolean => {
      if (closed) return false;
      try {
        const fingerprint = fingerprintContent(content);
        return fingerprint === baselineFingerprint || (pending !== undefined && fingerprint === fingerprintContent(pending.content));
      } catch {
        return false;
      }
    },
    applySnapshot,
    /** Human and Agent transactions share one revision and the same native working document. */
    transact: (options: ProgramDocumentEditOptions & { update: (document: Record<string, unknown>) => void | Record<string, unknown> }): ProgramDocumentEditResult => {
      const rejected = checkEdit(options);
      if (rejected) return rejected;
      try {
        const draft = parseLosslessJson(state.content) as Record<string, unknown>;
        const next = options.update(draft) ?? draft;
        const nextContent = `${stringifyLosslessJson(next, 2)}\n`;
        parseProgramDocumentSnapshot(nextContent);
        // An updater must not reenter and overwrite an intervening transaction.
        const reentrant = checkEdit(options);
        if (reentrant) return reentrant;
        return commit(nextContent, options.source);
      } catch (error) {
        return failure("invalid_document", error instanceof Error ? error.message : String(error));
      }
    },
    /** Read the mounted editors now, rather than relying on a React render's older payload. */
    beginSave: (readLiveSnapshot: () => ActionProgramSnapshot): { ok: true; ticket: ProgramDocumentSaveTicket; state: ProgramDocumentState } | ProgramDocumentFailure => {
      if (closed) return failure("closed", "Program document session is closed");
      if (pending || preparingSave) return failure("save_in_progress", "A save is already in progress for this document");
      const expectedRevision = state.revision;
      preparingSave = true;
      try {
        const live = readLiveSnapshot();
        const applied = applySnapshot(live, { expectedRevision, source: "ui" });
        if (!applied.ok) return applied;
        if (state.metadata) validateProgramDocumentMetadataForSave(state.metadata.content);
        pending = Object.freeze({ saveId: nextSaveId++, revision: state.revision, content: state.content, baselineContent: state.baselineContent, identity: state.identity,
          ...(state.metadata ? { metadata: Object.freeze({ path: state.metadata.path, content: state.metadata.content, baselineContent: state.metadata.baselineContent }) } : {}),
        });
        state = Object.freeze({ ...state, saving: true });
        return { ok: true, ticket: pending, state };
      } catch (error) {
        return failure("invalid_document", error instanceof Error ? error.message : String(error));
      } finally {
        preparingSave = false;
      }
    },
    completeSave: (ticket: ProgramDocumentSaveTicket, outcome: ProgramDocumentSaveOutcome): ProgramDocumentEditResult => {
      if (closed) return failure("closed", "Program document session is closed");
      // Object ownership rejects tickets from a previous session, even with the same documentKey.
      if (pending !== ticket) return failure("stale_save", "Save completion does not belong to the active document save");
      pending = undefined;
      state = Object.freeze({ ...state, saving: false });
      if (outcome.ok && outcome.identity && !sameTarget(ticket.identity, outcome.identity)) {
        return failure("identity_conflict", "Save completion belongs to a different storage or host target", true);
      }
      // A legacy persisted flag does not identify which file reached disk. Only explicit parts advance on failure.
      const bodyPersisted = outcome.ok || outcome.persistedParts?.body === true;
      const metadataPersisted = outcome.ok || outcome.persistedParts?.metadata === true;
      if (bodyPersisted) baselineFingerprint = fingerprintContent(ticket.content);
      const metadata = metadataPersisted && ticket.metadata && state.metadata
        ? metadataState(state.metadata, ticket.metadata.content) : state.metadata;
      state = withDirty({
        ...state,
        ...(bodyPersisted ? { baselineContent: ticket.content } : {}),
        ...(metadata ? { metadata } : {}),
        identity: outcome.ok && outcome.identity ? immutableIdentity(outcome.identity) : state.identity,
      });
      if (!outcome.ok) return failure("save_failed", outcome.error ?? "Program document save failed", outcome.persisted, outcome.persistedParts);
      return { ok: true, changed: true, state };
    },
    close: (): void => {
      closed = true;
      pending = undefined;
      state = Object.freeze({ ...state, saving: false });
    },
  };
}

export type ProgramDocumentSession = ReturnType<typeof createProgramDocumentSession>;
