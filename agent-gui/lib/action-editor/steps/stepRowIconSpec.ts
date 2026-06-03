import type { ActionStep, ActionSubProgram } from "@/lib/action-editor/types/common";
import type { ActionStepNodeView } from "./actionStepNodeView";
import {
  findActionSubProgramForStoredValue,
  getSubProgramStepTargetPin,
  SUBPROGRAM_STEP_RUNNER_KEY,
} from "./subProgramStepResolve";

export type SubProgramStepListLabel = {
  displayName: string;
  icon: string;
};

/** Icon + title metadata for a step row (subprogram overrides runner catalog icon). */
export function resolveStepRowIconSpec(
  step: ActionStep,
  view: ActionStepNodeView,
  subPrograms: ActionSubProgram[],
  globalSpId: string | null,
  sharedSpIdent: string | null,
  globalLabels: Readonly<Record<string, SubProgramStepListLabel>>,
  sharedLabels: Readonly<Record<string, SubProgramStepListLabel>>,
): string {
  if (globalSpId != null) {
    const icon = (globalLabels[globalSpId]?.icon ?? "").trim();
    if (icon) return icon;
  }
  if (sharedSpIdent != null) {
    const icon = (sharedLabels[sharedSpIdent]?.icon ?? "").trim();
    if (icon) return icon;
  }

  if ((step.stepRunnerKey ?? "").trim() === SUBPROGRAM_STEP_RUNNER_KEY) {
    const pin = getSubProgramStepTargetPin(step);
    if (!(pin?.varKey ?? "").trim()) {
      const raw = (pin?.value ?? "").trim();
      if (raw) {
        const row = findActionSubProgramForStoredValue(raw, subPrograms);
        const icon = (row?.icon ?? "").trim();
        if (icon) return icon;
      }
    }
  }

  return view.iconSpec;
}
