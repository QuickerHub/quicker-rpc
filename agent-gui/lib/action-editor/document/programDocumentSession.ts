import type { ActionProgramSnapshot } from "../program/assembleActionProgramSnapshot";
import { fingerprintProgramDocumentContent, parseProgramDocumentSnapshot, programDocumentFingerprint, serializeProgramDocumentSnapshot } from "./programDocumentWire";

/** Identity is supplied by the storage/host adapter; a disk-only document has no invented host. */
export type ProgramDocumentIdentity = {
  documentKey: string;
  host?: { kind: string; instanceId: string; actionId: string; version?: string };
  storage?: { key: string; version?: string };
};

export type ProgramDocumentChangeSource = "ui" | "agent";

export type ProgramDocumentState = Readonly<{
  baselineContent: string;
  content: string;
  revision: number;
  dirty: boolean;
  saving: boolean;
  identity: Readonly<ProgramDocumentIdentity>;
  lastChangeSource?: ProgramDocumentChangeSource;
}>;

export type ProgramDocumentFailureCode = "revision_conflict" | "identity_conflict" | "invalid_document" | "save_in_progress" | "stale_save" | "save_failed" | "closed";
export type ProgramDocumentFailure = { ok: false; code: ProgramDocumentFailureCode; error: string; state: ProgramDocumentState; persisted?: boolean };
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
  identity: Readonly<ProgramDocumentIdentity>;
}>;

export type ProgramDocumentSaveOutcome =
  | { ok: true; identity?: ProgramDocumentIdentity }
  | { ok: false; error?: string; persisted?: boolean };

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

export function createProgramDocumentSession(initial: { content: string; identity: ProgramDocumentIdentity }) {
  // Validate the complete editing projection before exposing a writable session.
  parseProgramDocumentSnapshot(initial.content);
  let baselineFingerprint = fingerprintContent(initial.content);
  let contentFingerprint = baselineFingerprint;
  let state: ProgramDocumentState = Object.freeze({
    baselineContent: initial.content,
    content: initial.content,
    revision: 0,
    dirty: false,
    saving: false,
    identity: immutableIdentity(initial.identity),
  });
  let pending: ProgramDocumentSaveTicket | undefined;
  let preparingSave = false;
  let nextSaveId = 1;
  let closed = false;

  const failure = (code: ProgramDocumentFailureCode, error: string, persisted?: boolean): ProgramDocumentFailure => ({
    ok: false, code, error, state, ...(persisted === undefined ? {} : { persisted }),
  });
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
    state = Object.freeze({ ...state, content: nextContent, revision: state.revision + 1, dirty: contentFingerprint !== baselineFingerprint, lastChangeSource: source });
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
        const draft = JSON.parse(state.content) as Record<string, unknown>;
        const next = options.update(draft) ?? draft;
        const nextContent = `${JSON.stringify(next, null, 2)}\n`;
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
        pending = Object.freeze({ saveId: nextSaveId++, revision: state.revision, content: state.content, identity: state.identity });
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
      if (!outcome.ok) return failure("save_failed", outcome.error ?? "Program document save failed", outcome.persisted);
      if (outcome.identity && !sameTarget(ticket.identity, outcome.identity)) {
        return failure("identity_conflict", "Save completion belongs to a different storage or host target", true);
      }
      baselineFingerprint = fingerprintContent(ticket.content);
      state = Object.freeze({
        ...state,
        baselineContent: ticket.content,
        dirty: contentFingerprint !== baselineFingerprint,
        identity: outcome.identity ? immutableIdentity(outcome.identity) : state.identity,
      });
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
