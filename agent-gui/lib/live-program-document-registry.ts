import { createToolCallPolicyGate } from "./agent-tool-policy";
import { getToolModeOperationDecision } from "./agent-tool-mode-guard";
import { liveProgramOperationConstraint } from "./live-program-tool-composition";
import { programDocumentFingerprint } from "./action-editor/document/programDocumentWire";
import { inspectProgramDocumentStepInputs } from "./action-editor/document/programDocumentStepInputs";
import { parseActionProjectBinding } from "./action-project-binding";
import { inspectLiveProgramStepInputPolicy, isSupportedLiveStepLiteral } from "./live-program-step-input-policy";
import { readStepRunnerInputContract, STEP_RUNNER_INPUT_CONTRACT_CAPABILITY, type StepRunnerInputContract } from "./step-runner-input-contract";
import { isLiveProgramSourceTarget } from "./live-program-source-target";
import { parseLiveProgramDocumentToolInput } from "./live-program-document-tool";
import type { ProgramDocumentVariableSelector } from "./action-editor/document/programDocumentVariableLive";
import type { WorkspaceDocumentOwner } from "./workspace-document-instances";
import type { LiveProgramDocumentCommand, LiveProgramDocumentEndpoint, LiveProgramDocumentInput,
  LiveProgramDocumentPin, LiveProgramDocumentReceipt, LiveProgramDocumentRegistry, LiveProgramDocumentScope,
  LiveProgramDocumentSnapshot, LiveProgramDocumentTarget, LiveProgramDocumentExecutionOptions } from "./live-program-document";

type Entry = { owner: WorkspaceDocumentOwner; endpoint: LiveProgramDocumentEndpoint };
type Pin = { ref: LiveProgramDocumentPin; entry: Entry; target: LiveProgramDocumentTarget } &
  ({ kind: "step"; stepId: string; rowIdentity: string } | { kind: "variable"; variable: ProgramDocumentVariableSelector; rowIdentity?: string });
type SchemaProof = { stepId: string; runnerKey: string; revision: number; contract: StepRunnerInputContract; editableInputKeys: readonly string[] };
type Waiter = { execution?: LiveProgramDocumentExecutionOptions; finish(receipt: LiveProgramDocumentReceipt): void };
type PendingRead = { command: LiveProgramDocumentCommand; fingerprint: string; controller: AbortController; waiters: Set<Waiter> };
type Scope = { descriptor: LiveProgramDocumentScope; entry: Entry; closed?: string;
  allowedStepIds: ReadonlyMap<string, string>;
  allowedVariables: ReadonlyMap<string, { rowIdentity?: string }>;
  gate: ReturnType<typeof createToolCallPolicyGate>;
  operations: Map<string, { fingerprint: string; receipt: LiveProgramDocumentReceipt }>;
  pending: Map<string, PendingRead>; schemas: Map<string, SchemaProof>;
  captureFingerprint: string;
};
const ownerKey = (owner: WorkspaceDocumentOwner) => JSON.stringify([owner.key, owner.instanceId]);
const sameOwner = (a: WorkspaceDocumentOwner, b: WorkspaceDocumentOwner) => a.key === b.key && a.instanceId === b.instanceId
  && a.cwd === b.cwd && a.tabId === b.tabId && a.path === b.path;
const sameTarget = (a: LiveProgramDocumentTarget, b: LiveProgramDocumentTarget) => sameOwner(a.owner, b.owner)
  && a.sessionId === b.sessionId && programDocumentFingerprint(a.identity) === programDocumentFingerprint(b.identity)
  && programDocumentFingerprint({ format: a.format ?? "legacy-json", ...(a.format === "source-bundle" ? { source: a.source } : {}) })
    === programDocumentFingerprint({ format: b.format ?? "legacy-json", ...(b.format === "source-bundle" ? { source: b.source } : {}) });
const variableKey = (value: ProgramDocumentVariableSelector) => JSON.stringify([value.surface, value.variableId]);
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
  if (value?.action === "read_live" || value?.action === "edit_variable_live") {
    const parsed = parseLiveProgramDocumentToolInput({ ...value, scopeId: "registry-validation" });
    return Boolean(parsed && (value.action !== "edit_variable_live" || new TextEncoder().encode(JSON.stringify(value.changes)).length <= 1_048_576));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (value.action === "edit_step_inputs_live") return keys.join() === "action,changes,expectedRevision,readOperationId,stepId"
    && typeof value.readOperationId === "string" && Boolean(value.readOperationId.trim())
    && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0 && typeof value.stepId === "string" && Boolean(value.stepId.trim())
    && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= 32
    && value.changes.every((change) => change && typeof change === "object" && Object.keys(change).sort().join() === "key,value"
      && typeof change.key === "string" && Boolean(change.key.trim()) && typeof change.value === "string" && change.value.length <= 100_000)
    && new TextEncoder().encode(JSON.stringify(value.changes)).length <= 1_048_576;
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
    if (!current || !current.sessionId || !sameOwner(current.owner, entry.owner)) return;
    if (current.format === "source-bundle" ? !isLiveProgramSourceTarget(current.source) || current.identity.projectBinding !== undefined
      : current.identity.projectBinding === undefined) return;
    return current;
  };
  const closeEntry = (entry: Entry) => {
    for (const scope of scopes.values()) if (scope.entry === entry) closeScope(scope, "The original document endpoint was replaced or closed.");
    for (const [key, pin] of pins) if (pin.entry === entry) pins.delete(key);
    entry.endpoint.dispose?.();
  };
  const receiptBase = (scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand) => ({
    version: 1 as const, source: "live_document" as const, scopeId: scope.scopeId, operationId: command.operationId,
    target: { ownerKey: scope.target.owner.key, ownerInstanceId: scope.target.owner.instanceId,
      sessionId: scope.target.sessionId, documentKey: scope.target.identity.documentKey }, persisted: false as const,
  });
  const fail = (scope: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, code: string, error: string,
    application: "not_applied" | "unknown" = "not_applied"): LiveProgramDocumentReceipt => ({
    ...receiptBase(scope, command), ok: false, action: command.input?.action === "edit_variable_live" ? "edit_variable_live" : command.input?.action === "edit_step_inputs_live" ? "edit_step_inputs_live" : command.input?.action === "edit_live" ? "edit_live" : "read_live", code, error, retryable: false, application,
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


  const cancelled = (execution?: LiveProgramDocumentExecutionOptions) => Boolean(execution?.abortSignal?.aborted || execution?.isCancelled?.());
  const failureError = (code: string, message: string) => Object.assign(Error(message), { code });
  function finishPending(scope: Scope, pending: PendingRead, receipt: LiveProgramDocumentReceipt, proof?: SchemaProof) {
    if (scope.pending.get(pending.command.operationId) !== pending) return;
    if (proof) scope.schemas.set(pending.command.operationId, proof);
    scope.operations.set(pending.command.operationId, { fingerprint: pending.fingerprint, receipt: structuredClone(receipt) });
    scope.pending.delete(pending.command.operationId);
    for (const waiter of [...pending.waiters]) waiter.finish(receipt);
  }
  function abortPending(scope: Scope, pending: PendingRead, code: string, reason: string) {
    finishPending(scope, pending, fail(scope.descriptor, pending.command, code, reason));
    pending.controller.abort(Error(reason));
  }
  function closeScope(scope: Scope, reason: string) {
    scope.closed = reason; scope.schemas.clear();
    for (const pending of [...scope.pending.values()]) abortPending(scope, pending, "LIVE_DOCUMENT_STALE", reason);
  }
  function observe(scope: Scope, pending: PendingRead, execution?: LiveProgramDocumentExecutionOptions): Promise<LiveProgramDocumentReceipt> {
    return new Promise((resolve) => {
      let done = false;
      const waiter: Waiter = { execution, finish(receipt) {
        if (done) return; done = true;
        execution?.abortSignal?.removeEventListener("abort", onAbort);
        pending.waiters.delete(waiter);
        resolve(structuredClone(receipt.ok && cancelled(execution) ? fail(scope.descriptor, pending.command, "REQUEST_ABORTED", "The metadata observer was cancelled.") : receipt));
        if (!pending.waiters.size && scope.pending.get(pending.command.operationId) === pending)
          abortPending(scope, pending, "REQUEST_ABORTED", "The metadata observer was cancelled.");
      } };
      const onAbort = () => waiter.finish(fail(scope.descriptor, pending.command, "REQUEST_ABORTED", "The metadata observer was cancelled."));
      pending.waiters.add(waiter);
      execution?.abortSignal?.addEventListener("abort", onAbort, { once: true });
      if (cancelled(execution)) onAbort();
    });
  }
  function awaitMetadata<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const onAbort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
      Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    });
  }
  function assertMetadataCurrent(scope: Scope, pending: PendingRead, snapshot: LiveProgramDocumentSnapshot) {
    pending.controller.signal.throwIfAborted();
    if (scope.closed || scopes.get(scope.descriptor.scopeId) !== scope || scope.pending.get(pending.command.operationId) !== pending
      || ![...pending.waiters].some((waiter) => !cancelled(waiter.execution)))
      throw failureError("REQUEST_ABORTED", "The metadata read no longer has an active manual-turn observer.");
    const current = read(scope.entry, scope.descriptor.target);
    if (current.revision !== snapshot.revision || current.content !== snapshot.content
      || programDocumentFingerprint(current.steps) !== programDocumentFingerprint(snapshot.steps))
      throw failureError("revision_conflict", "The original document changed while its native input schema was loading.");
  }
  async function loadSchema(scope: Scope, pending: PendingRead, snapshot: LiveProgramDocumentSnapshot, stepId: string): Promise<SchemaProof> {
    const matches = snapshot.steps.filter((step) => step.stepId === stepId);
    if (matches.length !== 1) throw failureError("LIVE_STEP_AMBIGUOUS", "The pinned step is missing or not unique.");
    const step = matches[0]!, target = scope.descriptor.target, projectBinding = target.identity.projectBinding;
    const binding = target.format === "source-bundle" ? target.source.hostBinding ?? undefined
      : projectBinding ? parseActionProjectBinding(projectBinding, projectBinding.actionId).hostBinding : undefined;
    const endpoint = scope.entry.endpoint;
    if (!binding || !["v1", "v2"].includes(binding.hostKind) || binding.capabilities[STEP_RUNNER_INPUT_CONTRACT_CAPABILITY] !== true || !endpoint.readInputContract)
      throw failureError("LIVE_INPUT_CONTRACT_UNAVAILABLE", "The original bound document has no declared native input contract port.");
    const inspector = inspectProgramDocumentStepInputs(snapshot.content, stepId, step.runnerKey);
    const request = async (controlFieldValue?: string) => {
      assertMetadataCurrent(scope, pending, snapshot);
      const raw = await awaitMetadata(endpoint.readInputContract!({ stepRunnerKey: step.runnerKey,
        ...(controlFieldValue === undefined ? {} : { controlFieldValue }) }, pending.controller.signal), pending.controller.signal);
      assertMetadataCurrent(scope, pending, snapshot);
      return readStepRunnerInputContract(raw, { hostKind: binding.hostKind, stepRunnerKey: step.runnerKey });
    };
    let contract = await request();
    const controlKey = contract.controlFieldKey;
    if (controlKey !== null) {
      const control = inspector.readValue(controlKey);
      if (control.kind === "unavailable") throw failureError("LIVE_INPUT_CONTROL_UNAVAILABLE", control.reason);
      const value = control.kind === "missing" ? contract.appliedControlFieldValue : control.value;
      if (value === null || !isSupportedLiveStepLiteral(value))
        throw failureError("LIVE_INPUT_CONTROL_UNAVAILABLE", "The control value is missing, dynamic or not a proven native default.");
      if (value !== contract.appliedControlFieldValue) {
        contract = await request(value);
        if (contract.controlFieldKey !== controlKey || contract.appliedControlFieldValue !== value)
          throw failureError("LIVE_INPUT_CONTROL_UNAVAILABLE", "The native contract did not retain the exact original control field and value.");
      }
    }
    assertMetadataCurrent(scope, pending, snapshot);
    const policy = inspectLiveProgramStepInputPolicy(snapshot.content, stepId, step.runnerKey, contract);
    return freeze({ stepId, runnerKey: step.runnerKey, revision: snapshot.revision, contract: structuredClone(contract), editableInputKeys: [...policy.editableInputKeys] });
  }
  function executeAsync(descriptor: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, execution?: LiveProgramDocumentExecutionOptions): Promise<LiveProgramDocumentReceipt> {
    if (command.input?.action !== "read_live" || command.input.stepSchemaFor === undefined || !validInput(command.input))
      return Promise.resolve(executeCommand(descriptor, command, execution));
    const scope = scopes.get(descriptor.scopeId);
    let fingerprint: string, captured: LiveProgramDocumentCommand;
    try { fingerprint = programDocumentFingerprint(command.input); captured = structuredClone(command); }
    catch { return Promise.resolve(fail(descriptor, command, "LIVE_INVALID_INPUT", "The live command input is invalid.")); }
    if (!scope || command.scopeId !== descriptor.scopeId || programDocumentFingerprint(descriptor) !== programDocumentFingerprint(scope.descriptor) || !command.operationId?.trim())
      return Promise.resolve(executeCommand(descriptor, command, execution));
    const previous = scope.operations.get(command.operationId);
    if (previous) return Promise.resolve(executeCommand(descriptor, command, execution));
    const existing = scope.pending.get(command.operationId);
    if (existing) return existing.fingerprint === fingerprint ? observe(scope, existing, execution)
      : Promise.resolve(fail(descriptor, command, "LIVE_OPERATION_CONFLICT", "This operation id already belongs to a different input."));
    if (scope.operations.size + scope.pending.size >= 128)
      return Promise.resolve(fail(descriptor, command, "LIVE_OPERATION_LIMIT", "The receipt ledger is full; prior outcomes were retained."));
    const pending: PendingRead = { command: captured, fingerprint, controller: new AbortController(), waiters: new Set() };
    scope.pending.set(command.operationId, pending);
    const observer = observe(scope, pending, execution);
    void Promise.resolve().then(async () => {
      if (scope.pending.get(captured.operationId) !== pending) return;
      const base = executeCommand(descriptor, captured, { isCancelled: () => ![...pending.waiters].some((waiter) => !cancelled(waiter.execution)) }, pending);
      if (!base.ok || base.action !== "read_live") { finishPending(scope, pending, base); return; }
      const proof = await loadSchema(scope, pending, base, (captured.input as { stepSchemaFor: string }).stepSchemaFor);
      assertMetadataCurrent(scope, pending, base);
      finishPending(scope, pending, { ...base, stepInputSchema: { stepId: proof.stepId, contract: proof.contract, editableInputKeys: proof.editableInputKeys } }, proof);
    }).catch((error) => finishPending(scope, pending, fail(descriptor, captured,
      pending.controller.signal.aborted ? "REQUEST_ABORTED" : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "LIVE_INPUT_SCHEMA_UNAVAILABLE",
      error instanceof Error ? error.message : String(error))));
    return observer;
  }

  function executeCommand(descriptor: LiveProgramDocumentScope, command: LiveProgramDocumentCommand, execution?: LiveProgramDocumentExecutionOptions, preparing?: PendingRead): LiveProgramDocumentReceipt {
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
        if (!(preparing && receipt.ok && receipt.action === "read_live")) scope.operations.set(command.operationId, { fingerprint, receipt: structuredClone(receipt) });
        return receipt;
      };
      if (!command.operationId?.trim() || command.scopeId !== descriptor.scopeId || programDocumentFingerprint(descriptor) !== programDocumentFingerprint(scope.descriptor))
        return fail(descriptor, command, "LIVE_SCOPE_CONFLICT", "The command does not belong to this exact manual turn and document.");
      const pending = scope.pending.get(command.operationId);
      if (pending && pending !== preparing) return fail(descriptor, command, pending.fingerprint === fingerprint ? "LIVE_OPERATION_PENDING" : "LIVE_OPERATION_CONFLICT", "This operation already has an in-flight metadata read.");
      if (scope.operations.size + scope.pending.size - (preparing ? 1 : 0) >= 128) return fail(descriptor, command, "LIVE_OPERATION_LIMIT", "The receipt ledger is full; prior outcomes were retained.");
      if (!validInput(command.input)) return store(fail(descriptor, command, "LIVE_INVALID_INPUT", "Only a complete live read or a versioned pinned-step edit is supported."));
      if (command.input.action === "read_live" && command.input.stepSchemaFor !== undefined && !preparing)
        return store(fail(descriptor, command, "LIVE_ASYNC_READ_REQUIRED", "Native input metadata must be read through executeAsync."));
      const current = target(scope.entry);
      if (scope.closed || !current || !sameTarget(current, descriptor.target)) return store(fail(descriptor, command, "LIVE_DOCUMENT_STALE", scope.closed ?? "The original document instance or complete identity changed."));
      const permission = getToolModeOperationDecision("workspace_program", descriptor.mode === "read" ? "ask" : "agent",
        command.input, true, liveProgramOperationConstraint(descriptor.mode));
      if (!permission.allowed) return store(fail(descriptor, command, "tool_mode_denied", permission.reason));
      const grantedStep = command.input.action === "read_live" ? command.input.stepSchemaFor : command.input.action === "edit_variable_live" ? undefined : command.input.stepId;
      if (grantedStep !== undefined && !scope.allowedStepIds.has(grantedStep))
        return store(fail(descriptor, command, "LIVE_STEP_NOT_GRANTED", "This step was not pinned for the original manual user send; the complete read is context only."));
      if (grantedStep !== undefined) {
        const selected = scope.entry.endpoint.readStep?.(grantedStep);
        if (!selected?.ok || selected.step.rowIdentity !== scope.allowedStepIds.get(grantedStep))
          return store(fail(descriptor, command, selected?.ok ? "LIVE_STEP_STALE" : selected?.code ?? "LIVE_STEP_UNAVAILABLE",
            selected?.ok ? "The original step row was removed, moved or replaced." : selected?.error ?? "Step row identity is unavailable."));
      }
      const grantedVariable = command.input.action === "read_live" ? command.input.variableFor : command.input.action === "edit_variable_live" ? command.input : undefined;
      if (grantedVariable && !scope.allowedVariables.has(variableKey(grantedVariable)))
        return store(fail(descriptor, command, "LIVE_VARIABLE_NOT_GRANTED", "This exact variable surface and identity were not pinned for this manual send."));
      if (cancelled(execution)) return store(fail(descriptor, command, "REQUEST_ABORTED", "The manual turn was cancelled before the operation."));
      const policy = scope.gate.consume("workspace_program", command.input);
      if (policy) return store(fail(descriptor, command, "tool_call_limit", policy.stderr ?? "The tool call policy rejected this operation."));
      let editDispatched = false;
      try {
        const snapshot = read(scope.entry, descriptor.target);
        if (cancelled(execution)) return store(fail(descriptor, command, "REQUEST_ABORTED", "The manual turn was cancelled before the operation."));
        if (command.input.action === "read_live") {
          if (new TextEncoder().encode(snapshot.content).length > (options.maxContentBytes ?? 1_048_576))
            return store(fail(descriptor, command, "LIVE_DOCUMENT_TOO_LARGE", "The complete document exceeds the live tool payload limit; no partial read or disk fallback was used."));
          let variable;
          if (command.input.variableFor) {
            const selected = scope.entry.endpoint.readVariable?.(command.input.variableFor);
            if (!selected?.ok) return store(fail(descriptor, command, selected?.code ?? "LIVE_VARIABLE_UNAVAILABLE", selected?.error ?? "Variable field contracts are unavailable."));
            if (selected.variable.rowIdentity !== scope.allowedVariables.get(variableKey(command.input.variableFor))?.rowIdentity)
              return store(fail(descriptor, command, "LIVE_VARIABLE_STALE", "The original variable row was removed or replaced."));
            variable = selected.variable;
            if (new TextEncoder().encode(JSON.stringify({ ...snapshot, variable })).length > (options.maxContentBytes ?? 1_048_576))
              return store(fail(descriptor, command, "LIVE_DOCUMENT_TOO_LARGE", "The complete variable read exceeds the live payload limit."));
          }
          return store({ ...receiptBase(descriptor, command), ok: true, action: "read_live", complete: true, ...snapshot, ...(variable ? { variable } : {}) });
        }
        const edit = command.input;
        const proof = scope.operations.get(edit.readOperationId)?.receipt;
        if (!proof?.ok || proof.action !== "read_live" || proof.revision !== edit.expectedRevision)
          return store(fail(descriptor, command, "LIVE_READ_REQUIRED", "Read this live scope and use that exact read operation and revision before editing."));
        if (snapshot.revision !== edit.expectedRevision)
          return store(fail(descriptor, command, "revision_conflict", "The document changed after the read; read its current revision again."));
        if (edit.action === "edit_variable_live") {
          if (!proof.variable || variableKey(proof.variable) !== variableKey(edit) || proof.variable.contract.revision !== edit.contractRevision)
            return store(fail(descriptor, command, "LIVE_VARIABLE_READ_REQUIRED", "Use the actual targeted variable read and its contract revision."));
          const currentVariable = scope.entry.endpoint.readVariable?.(edit);
          if (!currentVariable?.ok) return store(fail(descriptor, command, currentVariable?.code ?? "LIVE_VARIABLE_UNAVAILABLE", currentVariable?.error ?? "The variable is unavailable."));
          if (currentVariable.variable.rowIdentity !== proof.variable.rowIdentity || currentVariable.variable.variableJson !== proof.variable.variableJson
            || programDocumentFingerprint(currentVariable.variable.contract) !== programDocumentFingerprint(proof.variable.contract))
            return store(fail(descriptor, command, "LIVE_VARIABLE_STALE", "The original variable row or field contract changed."));
          if (!scope.entry.endpoint.setVariable) return store(fail(descriptor, command, "LIVE_VARIABLE_UNAVAILABLE", "This endpoint cannot edit variables."));
          if (cancelled(execution)) return store(fail(descriptor, command, "REQUEST_ABORTED", "The variable edit was cancelled before commit."));
          editDispatched = true;
          const result = scope.entry.endpoint.setVariable({ expectedRevision: edit.expectedRevision, expectedIdentity: descriptor.target.identity,
            surface: edit.surface, variableId: edit.variableId, contractRevision: edit.contractRevision, changes: structuredClone(edit.changes) });
          if (!result.ok) return store(fail(descriptor, command, result.code, result.error));
          return store({ ...receiptBase(descriptor, command), ok: true, action: "edit_variable_live", applied: true, changed: result.changed,
            revisionBefore: result.revisionBefore, revisionAfter: result.revisionAfter, dirty: result.dirty, undoable: result.changed,
            surface: edit.surface, variableId: edit.variableId, changedFields: result.changedFields ?? edit.changes.map(change => change.field) });
        }
        if (snapshot.steps.filter((step) => step.stepId === edit.stepId).length !== 1)
          return store(fail(descriptor, command, "LIVE_STEP_AMBIGUOUS", "The target step is missing or not unique in this document."));
        if (edit.action === "edit_step_inputs_live") {
          const schema = scope.schemas.get(edit.readOperationId);
          if (!schema || schema.stepId !== edit.stepId || schema.revision !== edit.expectedRevision)
            return store(fail(descriptor, command, "LIVE_INPUT_SCHEMA_REQUIRED", "Use the actual schema read operation for this pinned step and revision."));
          if (!scope.entry.endpoint.setStepInputs)
            return store(fail(descriptor, command, "LIVE_INPUT_EDIT_UNAVAILABLE", "This document endpoint does not support live input editing."));
          const policy = inspectLiveProgramStepInputPolicy(snapshot.content, edit.stepId, schema.runnerKey, schema.contract);
          const allowed = policy.validateChanges(edit.changes);
          if (edit.changes.some((change) => !schema.editableInputKeys.includes(change.key)))
            return store(fail(descriptor, command, "LIVE_STEP_INPUT_UNSUPPORTED", "The original schema proof did not authorize this input."));
          editDispatched = true;
          const result = scope.entry.endpoint.setStepInputs({ expectedRevision: edit.expectedRevision, expectedIdentity: descriptor.target.identity,
            stepId: edit.stepId, expectedRunnerKey: schema.runnerKey, changes: structuredClone(edit.changes), allowedInputKeys: allowed });
          if (!result.ok) return store(fail(descriptor, command, result.code, result.error));
          return store({ ...receiptBase(descriptor, command), ok: true, action: "edit_step_inputs_live", applied: true,
            changed: result.changed, revisionBefore: result.revisionBefore, revisionAfter: result.revisionAfter, dirty: result.dirty, undoable: result.changed });
        }
        editDispatched = true;
        const result = scope.entry.endpoint.setStepNote({ expectedRevision: edit.expectedRevision,
          expectedIdentity: descriptor.target.identity, stepId: edit.stepId, note: edit.note });
        if (!result.ok) return store(fail(descriptor, command, result.code, result.error));
        // The synchronous commit fact is retained before any SDK acknowledgement or caller cancellation.
        return store({ ...receiptBase(descriptor, command), ok: true, action: "edit_live", applied: true,
          changed: result.changed, revisionBefore: result.revisionBefore, revisionAfter: result.revisionAfter, dirty: result.dirty, undoable: result.changed });
      } catch (error) { return store(fail(descriptor, command, editDispatched ? "LIVE_RESULT_UNKNOWN" : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "LIVE_DOCUMENT_FAILED",
        error instanceof Error ? error.message : String(error), editDispatched ? "unknown" : "not_applied")); }
  }

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
        const selected = entry.endpoint.readStep?.(stepId);
        if (!selected?.ok) return denied(selected?.code ?? "LIVE_STEP_UNAVAILABLE", selected?.error ?? "Step row identity is unavailable.");
        pins.set(ref.pinId, { kind: "step", ref, entry, target: structuredClone(current), stepId, rowIdentity: selected.step.rowIdentity });
        return ref;
      } catch (error) { return denied("LIVE_DOCUMENT_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
    },
    pinVariable(owner, tagId, variable, threadId) {
      const entry = entries.get(ownerKey(owner));
      if (!entry || !tagId.trim() || !threadId.trim() || !variable.surface?.trim() || !variable.variableId?.trim()) return denied("LIVE_DOCUMENT_UNAVAILABLE", "The variable has no original live endpoint.");
      const current = target(entry);
      if (!current) return denied("LIVE_DOCUMENT_UNAVAILABLE", "The variable document identity is unresolved or closed.");
      try {
        read(entry, current);
        const selected = entry.endpoint.readVariable?.(variable);
        if (!selected?.ok) return denied(selected?.code ?? "LIVE_VARIABLE_UNAVAILABLE", selected?.error ?? "The original variable is unavailable.");
        if (pins.size >= 512) return denied("LIVE_PIN_LIMIT", "Too many live pins are retained.");
        const ref = Object.freeze({ pinId: id(), tagId, threadId });
        pins.set(ref.pinId, { kind: "variable", ref, entry, target: structuredClone(current), variable: structuredClone(variable), rowIdentity: selected.variable.rowIdentity });
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
        if (selected.some((pin) => pin.kind === "step" ? (() => {
          const row = first.entry.endpoint.readStep?.(pin.stepId);
          return snapshot.steps.filter((step) => step.stepId === pin.stepId).length !== 1 || !row?.ok || row.step.rowIdentity !== pin.rowIdentity;
        })() : (() => {
          const row = first.entry.endpoint.readVariable?.(pin.variable);
          return !row?.ok || row.variable.rowIdentity !== pin.rowIdentity;
        })()))
          return unavailable("LIVE_PIN_STALE", "The original pinned step is missing or ambiguous in this document.");
      } catch (error) { return unavailable("LIVE_DOCUMENT_UNAVAILABLE", error instanceof Error ? error.message : String(error)); }
      for (const scope of scopes.values()) if (scope.descriptor.threadId === input.threadId) closeScope(scope, "A newer manual send owns this Chat.");
      while (scopes.size >= 64) {
        const closed = [...scopes].find(([, scope]) => scope.closed);
        if (!closed) return unavailable("LIVE_SCOPE_LIMIT", "Too many live document turns are active.");
        scopes.delete(closed[0]);
      }
      const descriptor = freeze({ version: 1 as const, scopeId: id(), threadId: input.threadId, userMessageId: input.userMessageId,
        cwd: input.cwd.trim(), mode: input.mode, target: structuredClone(first.target) });
      const scope: Scope = { descriptor, entry: first.entry, allowedStepIds: new Map(selected.flatMap(pin => pin.kind === "step" ? [[pin.stepId, pin.rowIdentity] as const] : [])),
        allowedVariables: new Map(selected.flatMap(pin => pin.kind === "variable" ? [[variableKey(pin.variable), { rowIdentity: pin.rowIdentity }] as const] : [])),
        gate: createToolCallPolicyGate(), operations: new Map(), pending: new Map(), schemas: new Map(), captureFingerprint: fingerprint };
      scopes.set(descriptor.scopeId, scope);
      for (const pin of selected) pins.delete(pin.ref.pinId);
      return { state: "ready", scope: descriptor };
    },
    execute: (descriptor, command, execution) => executeCommand(descriptor, command, execution),
    executeAsync,
    revokeScope(scopeId, reason) { const scope = scopes.get(scopeId); if (scope) closeScope(scope, reason ?? "The manual turn was closed."); },
    dispose() { disposed = true; for (const scope of scopes.values()) closeScope(scope, "The document host was disposed."); entries.clear(); pins.clear(); },
  };
}
