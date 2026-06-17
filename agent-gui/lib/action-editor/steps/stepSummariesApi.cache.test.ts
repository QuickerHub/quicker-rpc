import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import {
  buildStepSummaryCacheFromBatch,
  resolveCachedStepSummary,
  stepBodyFingerprint,
} from "@/lib/action-editor/steps/stepSummariesApi";

test("resolveCachedStepSummary returns empty when stepId missing", () => {
  const step = ActionStep.fromPartial({ stepRunnerKey: "delay" });
  assert.equal(resolveCachedStepSummary(step, {}), "");
});

test("resolveCachedStepSummary returns empty when fingerprint mismatches", () => {
  const step = ActionStep.fromPartial({
    stepId: "s1",
    stepRunnerKey: "sys:regex",
    inputParams: { pattern: { value: "^x" } },
  });
  const cache = {
    s1: { bodyFingerprint: "stale", summary: "^x" },
  };
  assert.equal(resolveCachedStepSummary(step, cache), "");
});

test("resolveCachedStepSummary returns summary when fingerprint matches", () => {
  const step = ActionStep.fromPartial({
    stepId: "s1",
    stepRunnerKey: "sys:regex",
    inputParams: { pattern: { value: "^x" } },
  });
  const fp = stepBodyFingerprint(step);
  const cache = {
    s1: { bodyFingerprint: fp, summary: "^x" },
  };
  assert.equal(resolveCachedStepSummary(step, cache), "^x");
});

test("buildStepSummaryCacheFromBatch stores fingerprint per step", () => {
  const steps = [
    ActionStep.fromPartial({
      stepId: "a",
      stepRunnerKey: "delay",
      inputParams: { delayMs: { value: "100" } },
    }),
    ActionStep.fromPartial({
      stepId: "b",
      stepRunnerKey: "sys:notify",
      inputParams: { message: { value: "hi" } },
    }),
  ];
  const cache = buildStepSummaryCacheFromBatch(steps, {
    a: "100ms",
    b: "",
    c: "orphan",
  });
  assert.equal(Object.keys(cache).length, 1);
  assert.equal(cache.a.summary, "100ms");
  assert.equal(cache.a.bodyFingerprint, stepBodyFingerprint(steps[0]!));
});

test("buildStepSummaryCacheFromBatch replaces stale entries for same stepId", () => {
  const stepV1 = ActionStep.fromPartial({
    stepId: "shared",
    stepRunnerKey: "sys:regex",
    inputParams: { pattern: { value: "^x" } },
  });
  const stepV2 = ActionStep.fromPartial({
    stepId: "shared",
    stepRunnerKey: "sys:regex",
    inputParams: { pattern: { value: "^y" } },
  });
  const cacheV1 = buildStepSummaryCacheFromBatch([stepV1], { shared: "^x" });
  assert.equal(resolveCachedStepSummary(stepV2, cacheV1), "");
  const cacheV2 = buildStepSummaryCacheFromBatch([stepV2], { shared: "^y" });
  assert.equal(resolveCachedStepSummary(stepV2, cacheV2), "^y");
});
