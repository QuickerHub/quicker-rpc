import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeStepRunnerLookupEntries,
  sanitizeStepRunnerLookupForPersist,
} from "./stepRunnerLookupMerge";

test("mergeStepRunnerLookupEntries keeps non-empty icon when overlay is empty", () => {
  const merged = mergeStepRunnerLookupEntries(
    {
      "sys:assign": {
        key: "sys:assign",
        name: "赋值",
        description: "为变量赋值。",
        icon: "",
        stepType: "",
      },
    },
    {
      "sys:assign": {
        key: "sys:assign",
        name: "赋值",
        description: "",
        icon: "fa:Light_Edit:#6aaded",
        stepType: "Action",
      },
    },
  );
  assert.equal(merged["sys:assign"]?.icon, "fa:Light_Edit:#6aaded");
});

test("sanitizeStepRunnerLookupForPersist drops icon-less rows", () => {
  const sanitized = sanitizeStepRunnerLookupForPersist({
    "sys:assign": {
      key: "sys:assign",
      name: "赋值",
      description: "为变量赋值。",
      icon: "",
      stepType: "",
    },
    "sys:log": {
      key: "sys:log",
      name: "日志",
      description: "",
      icon: "fa:Log:#fff",
      stepType: "",
    },
  });
  assert.equal(sanitized["sys:assign"], undefined);
  assert.equal(sanitized["sys:log"]?.icon, "fa:Log:#fff");
});

test("sanitizeStepRunnerLookupForPersist enriches icons from catalog lookup", () => {
  const sanitized = sanitizeStepRunnerLookupForPersist(
    {
      "sys:assign": {
        key: "sys:assign",
        name: "赋值",
        description: "为变量赋值。",
        icon: "",
        stepType: "",
      },
    },
    {
      "sys:assign": {
        key: "sys:assign",
        name: "赋值",
        description: "为变量赋值。",
        icon: "fa:Light_Edit:#6aaded",
        stepType: "Action",
      },
    },
  );
  assert.equal(sanitized["sys:assign"]?.icon, "fa:Light_Edit:#6aaded");
});
