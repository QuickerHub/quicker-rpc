import { describe, expect, it } from "vitest";
import { ActionStep } from "@/lib/action-editor/types/common";
import { buildActionStepNodeView } from "./actionStepNodeView";
import { resolveStepRowIconSpec } from "./stepRowIconSpec";
import { SUBPROGRAM_STEP_RUNNER_KEY } from "./subProgramStepResolve";

describe("resolveStepRowIconSpec", () => {
  it("uses global subprogram icon over runner catalog icon", () => {
    const step = ActionStep.fromPartial({
      stepRunnerKey: SUBPROGRAM_STEP_RUNNER_KEY,
      inputParams: {
        subProgram: { value: "%%abc-123" },
      },
    });
    const view = buildActionStepNodeView(step, {
      key: SUBPROGRAM_STEP_RUNNER_KEY,
      name: "运行子程序",
      description: "运行子程序",
      icon: "fa:Solid_Cubes:#3196F4",
      stepType: "Action",
    });
    const icon = resolveStepRowIconSpec(
      step,
      view,
      [],
      "abc-123",
      null,
      { "abc-123": { displayName: "My SP", icon: "fa:Light_Code" } },
      {},
    );
    expect(icon).toBe("fa:Light_Code");
  });
});
