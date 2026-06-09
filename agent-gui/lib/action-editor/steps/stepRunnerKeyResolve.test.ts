import assert from "node:assert/strict";
import { test } from "node:test";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import {
  resolveCanonicalStepRunnerKey,
  resolveRunnerItemForStepKey,
  resolveStepRunnerKeyCandidates,
  stepRunnerKeysEquivalent,
} from "./stepRunnerKeyResolve";

test("stepRunnerKeysEquivalent matches bare and sys: keys", () => {
  assert.equal(stepRunnerKeysEquivalent("delay", "sys:delay"), true);
  assert.equal(stepRunnerKeysEquivalent("sys:delay", "delay"), true);
  assert.equal(stepRunnerKeysEquivalent("sys:delay", "sys:group"), false);
});

test("resolveStepRunnerKeyCandidates adds sys: alias", () => {
  assert.deepEqual(resolveStepRunnerKeyCandidates("delay"), ["delay", "sys:delay"]);
  assert.deepEqual(resolveStepRunnerKeyCandidates("sys:delay"), ["sys:delay"]);
});

test("resolveRunnerItemForStepKey matches by tail", () => {
  const items: StepRunnerItem[] = [
    {
      key: "sys:delay",
      name: "等待",
      description: "",
      icon: "",
      category: "",
      secondaryCategories: [],
      keywords: [],
      supportedParams: [],
      subItems: [],
      stepType: "",
      inputParamDefs: [{ key: "delayMs" } as StepRunnerItem["inputParamDefs"][number]],
      outputParamDefs: [],
    },
  ];
  const hit = resolveRunnerItemForStepKey(items, "delay");
  assert.equal(hit?.key, "sys:delay");
});

test("resolveCanonicalStepRunnerKey prefers catalog key", () => {
  const items: StepRunnerItem[] = [
    {
      key: "sys:delay",
      name: "等待",
      description: "",
      icon: "",
      category: "",
      secondaryCategories: [],
      keywords: [],
      supportedParams: [],
      subItems: [],
      stepType: "",
      inputParamDefs: [],
      outputParamDefs: [],
    },
  ];
  assert.equal(resolveCanonicalStepRunnerKey("delay", items), "sys:delay");
  assert.equal(resolveCanonicalStepRunnerKey("delay"), "sys:delay");
});
