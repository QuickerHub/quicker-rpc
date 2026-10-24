import { createToolCallPolicyGate } from "./agent-tool-policy";
import { getToolModeOperationDecision } from "./agent-tool-mode-guard";
import { liveProgramOperationConstraint } from "./live-program-tool-composition";
import { programDocumentFingerprint } from "./action-editor/document/programDocumentWire";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";
import type { LiveProgramDocumentCommand, LiveProgramDocumentEndpoint, LiveProgramDocumentInput,
  LiveProgramDocumentPin, LiveProgramDocumentReceipt, LiveProgramDocumentRegistry, LiveProgramDocumentScope,
  LiveProgramDocumentSnapshot, LiveProgramDocumentTarget } from "./live-program-document";

type Entry = { owner: WorkspaceDocumentOwner; endpoint: LiveProgramDocumentEndpoint };
type Pin = { ref: LiveProgramDocumentPin; entry: Entry; target: LiveProgramDocumentTarget; stepId: string };
type Scope = { descriptor: LiveProgramDocumentScope; entry: Entry; closed?: string;
  allowedStepIds: ReadonlySet<string>;
  gate: ReturnType<typeof createToolCallPolicyGate>;
  operations: Map<string, { fingerprint: string; receipt: LiveProgramDocumentReceipt }>;
  captureFingerprint: string;
};
const ownerKey = (owner: WorkspaceDocumentOwner) => JSON.stringify([owner.key, owner.instanceId]);
const sameOwner = (a: WorkspaceDocumentOwner, b: WorkspaceDocumentOwner) => a.key === b.key && a.instanceId === b.instanceId
  && a.cwd === b.cwd && a.tabId === b.tabId && a.path === b.path;
const sameTarget = (a: LiveProgramDocumentTarget, b: LiveProgramDocumentTarget) => sameOwner(a.owner, b.owner)
  && a.sessionId === b.sessionId && programDocumentFingerprint(a.identity) === programDocumentFingerprint(b.identity);
const denied = (code: string, error: string) => ({ ok: false as const, code, error, retryable: false as const });
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const nested of Object.values(value)) freeze(nested); Object.freeze(value); }
  return value;
}

function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(24))].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function validInput(value: LiveProgramDocumentInput): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (value.action === "read_live") return keys.join() === "action";
  return value.action === "edit_live" && keys.join() === "action,expectedRevision,note,readOperationId,stepId"
    && typeof value.readOperationId === "string" && Boolean(value.readOperationId.trim())
    && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0
    && typeof value.stepId === "string" && Boolean(value.stepId.trim()) && typeof value.note === "string"
    && value.note.length <= 100_000;
}

/** Endpoint/receipt ownership only: the existing renderer Session is the sole document source. */
export function createLiveProgramDocumentRegistry(options: {
  isOwnerCurrent(owner: WorkspaceDocumentOwner): boolean;
  createId?: () => string;
  maxContentBytes?: number;
}): LiveProgramDocumentRegistry {
  const entries = new Map<string, Entry>(), pins = new Map<string, Pin>(), scopes = new Map<string, Scope>();
  const id = options.createId ?? createId;
  let disposed = false;
  const active = (entry: Entry) => !disposed && entries.get(ownerKey(entry.owner)) === entry && options.isOwnerCurrent(entry.owner);
  const target = (entry: Entry) => {
    if (!active(entry)) return;
    const current = entry.endpoint.getTarget();
    if (!current || !current.sessionId || current.identity.projectBinding === undefined || !sameOwner(current.owner, entry.owner)) return;
    return current;
  };
  const closeEntry = (entry: Entry) => {
    for (const scope of scopes.values()) if (scope.entry === entry) scope.closed = "The original document endpoint was replaced or closed.";
    for (const [key, pin] of pins) if (pin.entry === entry) pins.delete(key);
  };
  const receiptBase = (scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand) => ({
    version: 1 as const, source: "live_document" as const, scopeId: scope.scopeId, operationId: command.operationId,
    target: { ownerKey: scope.target.owner.key, ownerInstanceId: scope.target.owner.instanceId,
      sessionId: scope.target.sessionId, documentKey: scope.target.identity.documentKey }, persisted: false as const,
  });
  const fail = (scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, code: string, error: string,
    application: "not_applied" | "unknown" = "not_applied"): LiveProgramDocumentReceipt => ({
    ...receiptBase(scope, command), ok: false, action: command.input?.action === "edit_live" ? "edit_live" : "read_live", code, error, retryable: false, application,
  });
  const read = (entry: Entry, expected: LiveProgramDocumentTarget): LiveProgramDocumentSnapshot => {
    const current = target(entry);
    if (!current || !sameTarget(current, expected)) throw Error("The original document target changed.");
    entry.endpoint.flushPendingEdits();
    const result = entry.endpoint.read();
    const after = target(entry);
    if (!after || !sameTarget(after, expected)) throw Error("The original document target changed while its drafts were flushed.");
    if (!result.ok) throw Error(result.error);
    return result.snapshot;
  };

  return {
    register(owner, endpoint) {
      if (disposed) return () => {};
      const key = ownerKey(owner), previous = entries.get(key);
      if (previous) closeEntry(previous);
      const entry = { owner, endpoint }; entries.set(key, entry);
      return () => { closeEntry(entry); if (entries.get(key) === entry) entries.delete(key); };
    },
    pin(owner, tagId, stepId, threadId) {
      const entry = entries.get(ownerKey(owner));
      if (!entry || !tagId.trim() || !threadId.trim()) return denied("LIVE_DOCUMENT_UNAVAILABLE", "The step has no live document endpoint.");
      const current = target(entry);
      if (!current) return denied("LIVE_DOCUMENT_UNAVAILABLE", "The live document identity is unresolved or closed.");
      try {
        const snapshot = read(entry, current);
        if (!stepId || snapshot.steps.filter((step) => step.stepId === stepId).length !== 1)
          return denied("LIVE_STEP_AMBIGUOUS", "The selected step is missing or not unique in this document.");
        if (pins.size >= 512) return denied("LIVE_PIN_LIMIT", "Too many live pins are retained; finish the current operation or reopen the document.");
        const ref = Object.freeze({ pinId: id(), tagId, threadId });
        pins.set(ref.pinId, { ref, entry, target: structuredClone(current), stepId });
        return ref;
      } catch (error) { return denied("LIVE_DOCUMENT_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
    },
    captureForManualSend(input) {
      if (!input.pins.length) return { state: "none" };
      const unavailable = (code: string, error: string) => ({ state: "unavailable" as const, code, error, retryable: false as const });
      if (disposed || !input.threadId.trim() || !input.userMessageId.trim() || !input.cwd.trim() || !["read", "edit"].includes(input.mode))
        return unavailable("LIVE_DOCUMENT_UNAVAILABLE", "A live document manual-send context is required.");
      const fingerprint = programDocumentFingerprint({ ...input, pins: [...input.pins].sort((a, b) => a.pinId.localeCompare(b.pinId)) });
      const existing = [...scopes.values()].find((scope) => scope.descriptor.threadId === input.threadId && scope.descriptor.userMessageId === input.userMessageId);
      if (existing) return existing.closed || existing.captureFingerprint !== fingerprint
        ? unavailable("LIVE_SCOPE_CONFLICT", "This manual user message already has a different or closed document scope.")
        : { state: "ready", scope: existing.descriptor };
      const selected: Pin[] = [];
      for (const ref of input.pins) {
        const pin = pins.get(ref.pinId);
        if (!pin || programDocumentFingerprint(pin.ref) !== programDocumentFingerprint(ref) || pin.ref.threadId !== input.threadId)
          return unavailable("LIVE_PIN_UNAVAILABLE", "A pin is stale, untrusted or already belongs to another manual send.");
        selected.push(pin);
      }
      const first = selected[0];
      if (selected.some((pin) => pin.entry !== first.entry || !sameTarget(pin.target, first.target)))
        return unavailable("LIVE_MULTIPLE_DOCUMENTS", "These pins belong to different document instances; no target was selected.");
      if (first.target.owner.cwd !== input.cwd.trim()) return unavailable("LIVE_CWD_CONFLICT", "The pinned document belongs to another working directory.");
      try {
        const snapshot = read(first.entry, first.target);
        if (selected.some((pin) => snapshot.steps.filter((step) => step.stepId === pin.stepId).length !== 1))
          return unavailable("LIVE_PIN_STALE", "The original pinned step is missing or ambiguous in this document.");
      } catch (error) { return unavailable("LIVE_DOCUMENT_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
      for (const scope of scopes.values()) if (scope.descriptor.threadId === input.threadId) scope.closed = "A newer manual send owns this Chat.";
      while (scopes.size >= 64) {
        const closed = [...scopes].find(([, scope]) => scope.closed);
        if (!closed) return unavailable("LIVE_SCOPE_LIMIT", "Too many live document turns are active.");
        scopes.delete(closed[0]);
      }
      const descriptor = freeze({ version: 1 as const, scopeId: id(), threadId: input.threadId, userMessageId: input.userMessageId,
        cwd: input.cwd.trim(), mode: input.mode, target: structuredClone(first.target) });
      const scope: Scope = { descriptor, entry: first.entry, allowedStepIds: new Set(selected.map((pin) => pin.stepId)),
        gate: createToolCallPolicyGate(), operations: new Map(), captureFingerprint: fingerprint };
      scopes.set(descriptor.scopeId, scope);
      for (const pin of selected) pins.delete(pin.ref.pinId);
      return { state: "ready", scope: descriptor };
    },
    execute(descriptor, command, execution) {
      const scope = scopes.get(descriptor.scopeId);
      let fingerprint: string;
      try { fingerprint = programDocumentFingerprint(command.input); }
      catch { return fail(descriptor, command, "LIVE_INVALID_INPUT", "The live command input is invalid."); }
      if (scope && (command.scopeId !== descriptor.scopeId || programDocumentFingerprint(descriptor) !== programDocumentFingerprint(scope.descriptor)))
        return fail(descriptor, command, "LIVE_SCOPE_CONFLICT", "The command does not belong to this exact manual turn and document.");
      const previous = scope?.operations.get(command.operationId);
      if (previous) return previous.fingerprint === fingerprint ? structuredClone(previous.receipt)
        : fail(descriptor, command, "LIVE_OPERATION_CONFLICT", "This operation id already belongs to a different input.");
      if (!scope || disposed) return fail(descriptor, command, "LIVE_SCOPE_UNAVAILABLE", "The original live scope is no longer available; no operation was replayed.", "unknown");
      const store = (receipt: LiveProgramDocumentReceipt) => {
        scope.operations.set(command.operationId, { fingerprint, receipt: structuredClone(receipt) });
        return receipt;
      };
      if (!command.operationId?.trim() || command.scopeId !== descriptor.scopeId || programDocumentFingerprint(descriptor) !== programDocumentFingerprint(scope.descriptor))
        return fail(descriptor, command, "LIVE_SCOPE_CONFLICT", "The command does not belong to this exact manual turn and document.");
      if (scope.operations.size >= 128) return fail(descriptor, command, "LIVE_OPERATION_LIMIT", "The receipt ledger is full; prior outcomes were retained.");
      if (!validInput(command.input)) return store(fail(descriptor, command, "LIVE_INVALID_INPUT", "Only a complete read or a versioned unique-step note edit is supported."));
      const current = target(scope.entry);
      if (scope.closed || !current || !sameTarget(current, descriptor.target)) return store(fail(descriptor, command, "LIVE_DOCUMENT_STALE", scope.closed ?? "The original document instance or complete identity changed."));
      const permission = getToolModeOperationDecision("workspace_program", descriptor.mode === "read" ? "ask" : "agent",
        command.input, true, liveProgramOperationConstraint(descriptor.mode));
      if (!permission.allowed) return store(fail(descriptor, command, "tool_mode_denied", permission.reason));
      if (command.input.action === "edit_live" && !scope.allowedStepIds.has(command.input.stepId))
        return store(fail(descriptor, command, "LIVE_STEP_NOT_GRANTED", "This step was not pinned for the original manual user send; the complete read is context only."));
      if (execution?.isCancelled?.()) return store(fail(descriptor, command, "REQUEST_ABORTED", "The manual turn was cancelled before the operation."));
      const policy = scope.gate.consume("workspace_program", command.input);
      if (policy) return store(fail(descriptor, command, "tool_call_limit", policy.stderr ?? "The tool call policy rejected this operation."));
      let editDispatched = false;
      try {
        const snapshot = read(scope.entry, descriptor.target);
        if (execution?.isCancelled?.()) return store(fail(descriptor, command, "REQUEST_ABORTED", "The manual turn was cancelled before the operation."));
        if (command.input.action === "read_live") {
          if (new TextEncoder().encode(snapshot.content).length > (options.maxContentBytes ?? 1_048_576))
            return store(fail(descriptor, command, "LIVE_DOCUMENT_TOO_LARGE", "The complete document exceeds the live tool payload limit; no partial read or disk fallback was used."));
          return store({ ...receiptBase(descriptor, command), ok: true, action: "read_live", complete: true, ...snapshot });
        }
        const edit = command.input;
        const proof = scope.operations.get(edit.readOperationId)?.receipt;
        if (!proof?.ok || proof.action !== "read_live" || proof.revision !== edit.expectedRevision)
          return store(fail(descriptor, command, "LIVE_READ_REQUIRED", "Read this live scope and use that exact read operation and revision before editing."));
        if (snapshot.revision !== edit.expectedRevision)
          return store(fail(descriptor, command, "revision_conflict", "The document changed after the read; read its current revision again."));
        if (snapshot.steps.filter((step) => step.stepId === edit.stepId).length !== 1)
          return store(fail(descriptor, command, "LIVE_STEP_AMBIGUOUS", "The target step is missing or not unique in this document."));
        editDispatched = true;
        const result = scope.entry.endpoint.setStepNote({ expectedRevision: edit.expectedRevision,
          expectedIdentity: descriptor.target.identity, stepId: edit.stepId, note: edit.note });
        if (!result.ok) return store(fail(descriptor, command, result.code, result.error));
        // The synchronous commit fact is retained before any SDK acknowledgement or caller cancellation.
        return store({ ...receiptBase(descriptor, command), ok: true, action: "edit_live", applied: true,
          changed: result.changed, revisionBefore: result.revisionBefore, revisionAfter: result.revisionAfter, dirty: result.dirty, undoable: result.changed });
      } catch (error) { return store(fail(descriptor, command, editDispatched ? "LIVE_RESULT_UNKNOWN" : "LIVE_DOCUMENT_FAILED",
        error instanceof Error ? error.message : String(error), editDispatched ? "unknown" : "not_applied")); }
    },
    revokeScope(scopeId, reason) { const scope = scopes.get(scopeId); if (scope) scope.closed = reason ?? "The manual turn was closed."; },
    dispose() { disposed = true; for (const scope of scopes.values()) scope.closed = "The document host was disposed."; entries.clear(); pins.clear(); },
  };
}
