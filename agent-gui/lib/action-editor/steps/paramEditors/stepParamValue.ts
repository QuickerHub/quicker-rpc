import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import type { ActionStepParam } from "@/lib/action-editor/types/common";

/** Build or migrate ActionStepParam for this definition key (from_old_field migration not applied here). */
export function ensureParamValue(def: StepRunnerInputParamDef, existing: ActionStepParam | undefined): ActionStepParam {
  // Only hydrate default when the param key does not exist yet.
  // If user has cleared the value to empty string, keep that explicit empty state.
  if (existing) {
    return {
      varKey: existing.varKey ?? "",
      value: existing.value ?? "",
      file: existing.file,
    };
  }
  const dv = def.defaultValue ?? "";
  return { varKey: "", value: dv };
}
