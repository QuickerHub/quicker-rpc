import { inspectProgramDocumentStepInputs } from "./action-editor/document/programDocumentStepInputs";
import type { StepRunnerInputContract, StepRunnerInputContractInput } from "./step-runner-input-contract";

export class LiveProgramStepInputPolicyError extends Error {
  readonly code = "LIVE_STEP_INPUT_UNSUPPORTED";
}
/** Temporary literal-only boundary; no escaping is claimed to neutralize native evaluation. */
export function isSupportedLiveStepLiteral(value: string): boolean {
  return value.length <= 100_000 && !/[$\p{Cf}]/u.test(value) && !value.normalize("NFKC").includes("$");
}

/** Shares the transaction's exact raw locator/binding proof; the typed editing projection is not authority. */
export function inspectLiveProgramStepInputPolicy(content: string, stepId: string, runnerKey: string, contract: StepRunnerInputContract) {
  if (contract.stepRunnerKey !== runnerKey) throw new LiveProgramStepInputPolicyError("The schema belongs to a different step runner.");
  const inspector = inspectProgramDocumentStepInputs(content, stepId, runnerKey);
  const editable = new Map<string, StepRunnerInputContractInput>();
  for (const row of contract.inputs) {
    const old = inspector.readValue(row.key);
    if (!row.policyKnown || row.blockedReason !== null || row.key === contract.controlFieldKey || row.isControlField !== false || !row.visibilityResolved || !row.visible
      || row.varType === null || row.variableMode === null || row.allowInput === null
      || ![0, 1, 2, 3].includes(row.variableMode)
      || !["allowed", "existing-literal-only", "existing-nonempty-literal-only"].includes(row.literalPolicy)
      || row.literalValueRestriction === "unknown" || (row.literalValueRestriction === "options" && !row.options.length)
      || old.kind !== "value" || !isSupportedLiveStepLiteral(old.value)
      || ((row.variableMode === 3 || row.literalPolicy === "existing-nonempty-literal-only") && old.value.length === 0)) continue;
    editable.set(row.key, row);
  }
  const editableInputKeys = Object.freeze([...editable.keys()]);
  return Object.freeze({
    editableInputKeys,
    validateChanges(changes: readonly Readonly<{ key: string; value: string }>[]): ReadonlySet<string> {
      if (!Array.isArray(changes) || changes.length === 0 || changes.length > 32)
        throw new LiveProgramStepInputPolicyError("Provide between one and 32 existing input changes.");
      const seen = new Set<string>();
      for (const change of changes) {
        if (!change || typeof change !== "object" || Object.keys(change).sort().join() !== "key,value"
          || typeof change.key !== "string" || typeof change.value !== "string")
          throw new LiveProgramStepInputPolicyError("Only an exact input key and a plain string value are supported.");
        const row = editable.get(change.key);
        if (!row || seen.has(change.key.toLowerCase())) throw new LiveProgramStepInputPolicyError("This input is not editable under the original raw document and native schema.");
        seen.add(change.key.toLowerCase());
        if (!isSupportedLiveStepLiteral(change.value)) throw new LiveProgramStepInputPolicyError("Dynamic or format-character values are unsupported by this literal-only operation.");
        if (row.literalValueRestriction === "options" && !row.options.includes(change.value))
          throw new LiveProgramStepInputPolicyError("The candidate value is not an explicit native selection option.");
      }
      if (new TextEncoder().encode(JSON.stringify(changes)).length > 1_048_576)
        throw new LiveProgramStepInputPolicyError("The input batch exceeds the live payload limit.");
      return new Set(editableInputKeys);
    },
  });
}
