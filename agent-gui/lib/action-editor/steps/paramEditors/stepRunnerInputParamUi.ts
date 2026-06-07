import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";

/** UI-only fields from step-runner get-ui not yet in generated proto. */
export type StepRunnerInputParamUiExtras = {
  textTools?: string;
};

export type StepRunnerInputParamUiDef = StepRunnerInputParamDef & StepRunnerInputParamUiExtras;

export function readParamTextTools(def: StepRunnerInputParamDef): string {
  return ((def as StepRunnerInputParamUiDef).textTools ?? "").trim();
}

export function parseParamTextToolIds(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
