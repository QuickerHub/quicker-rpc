import assert from "node:assert/strict";
import { test } from "node:test";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import {
  getCachedStepRunnerDetailItem,
  seedStepRunnerDetailCache,
} from "./designerHostGrpcApi";

test("seedStepRunnerDetailCache enables getCachedStepRunnerDetailItem hits", () => {
  const item: StepRunnerItem = {
    key: "sys:assign",
    inputParamDefs: [{ key: "input", name: "输入", varType: 0 }],
  };
  seedStepRunnerDetailCache({
    "sys:assign": item,
  });
  const hit = getCachedStepRunnerDetailItem("sys:assign");
  assert.equal(hit?.inputParamDefs?.[0]?.key, "input");
});
