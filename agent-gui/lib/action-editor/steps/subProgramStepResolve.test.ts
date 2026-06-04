import assert from "node:assert/strict";
import test from "node:test";
import type { ActionStep } from "@/lib/action-editor/types/common";
import {
  getSubProgramStepTargetRawValue,
  isSubProgramTargetPlaceholderSummary,
  resolveSubProgramStepListSecondaryText,
  resolveSubProgramStepListTitle,
  SUBPROGRAM_STEP_RUNNER_KEY,
} from "./subProgramStepResolve";

function subprogramStep(value: string, note = ""): ActionStep {
  return {
    stepId: "s-1",
    stepRunnerKey: SUBPROGRAM_STEP_RUNNER_KEY,
    note,
    inputParams: {
      subProgram: { value },
    },
  };
}

test("resolveSubProgramStepListTitle returns null for bare %% global link token", () => {
  const title = resolveSubProgramStepListTitle(
    subprogramStep("%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e"),
    [],
  );
  assert.equal(title, null);
});

test("resolveSubProgramStepListTitle parses @@ network title segment", () => {
  const title = resolveSubProgramStepListTitle(
    subprogramStep("@@abc-123@2@徽标"),
    [],
  );
  assert.equal(title, "徽标");
});

test("isSubProgramTargetPlaceholderSummary hides %% guid when primary is resolved", () => {
  const raw = "%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e";
  assert.equal(
    isSubProgramTargetPlaceholderSummary(raw, raw, "徽标"),
    true,
  );
  assert.equal(
    isSubProgramTargetPlaceholderSummary("徽标", raw, "徽标"),
    true,
  );
  assert.equal(
    isSubProgramTargetPlaceholderSummary("delay 100", raw, "徽标"),
    false,
  );
});

test("resolveSubProgramStepListSecondaryText drops raw target but keeps note", () => {
  const step = subprogramStep("%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e", "备注");
  assert.equal(
    resolveSubProgramStepListSecondaryText(step, [], {
      note: "备注",
      summary: "%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e",
      primaryRunnerName: "徽标",
    }),
    "备注",
  );
  assert.equal(
    resolveSubProgramStepListSecondaryText(step, [], {
      note: "",
      summary: "%%44e8b90d-9a97-4525-8bcc-96f10d1a9c7e",
      primaryRunnerName: "徽标",
    }),
    "",
  );
});

test("getSubProgramStepTargetRawValue ignores varKey binding", () => {
  const step: ActionStep = {
    stepId: "s-2",
    stepRunnerKey: SUBPROGRAM_STEP_RUNNER_KEY,
    inputParams: {
      subProgram: { varKey: "spVar", value: "%%ignored" },
    },
  };
  assert.equal(getSubProgramStepTargetRawValue(step), "");
});
