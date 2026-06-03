import type { ActionStep, ActionVariable } from "@/lib/action-editor/types/common";
import { StepIdManager } from "../steps/stepIdManager";

/**
 * Persisted X program bodies and older snapshots may omit {@link ActionStep.stepId} / {@link ActionVariable.id}.
 * The web editors require stable non-empty ids (DnD, multi-select, React keys).
 * Safe to call multiple times (only fills blanks; respects existing ids).
 */
export function normalizeLoadedProgramBodyIds(steps: ActionStep[], variables: ActionVariable[]): void {
  const stepIdManager = new StepIdManager();
  stepIdManager.syncFromSteps(steps);

  const walkSteps = (items: ActionStep[]): void => {
    for (const s of items) {
      if (!(s.stepId ?? "").trim()) {
        s.stepId = stepIdManager.nextId();
      }
      walkSteps(s.ifSteps ?? []);
      walkSteps(s.elseSteps ?? []);
    }
  };
  walkSteps(steps);

  const usedVarIds = new Set(
    variables.map((v) => (v.id ?? "").trim()).filter((id) => id.length > 0)
  );
  let varSeq = 1;
  for (const v of variables) {
    if ((v.id ?? "").trim().length > 0) {
      continue;
    }
    while (usedVarIds.has(`v-${varSeq}`)) {
      varSeq += 1;
    }
    const id = `v-${varSeq}`;
    varSeq += 1;
    v.id = id;
    usedVarIds.add(id);
  }
}
