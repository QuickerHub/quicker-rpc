import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import { collectUsedVariableKeysForSteps } from "@/lib/action-editor/steps/actionStepsClipboard";

test("collectUsedVariableKeysForSteps scans inline param values", () => {
  const known = new Set(["title", "count"]);
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "sys:comment",
      inputParams: {
        note: { value: "Hello {title}" },
      },
    }),
  ];
  const used = collectUsedVariableKeysForSteps(steps, known);
  assert.deepEqual([...used].sort(), ["title"]);
});

test("collectUsedVariableKeysForSteps scans external expression files", () => {
  const known = new Set(["payload", "unused"]);
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "sys:evalexpression",
      inputParams: {
        expression: { value: "", file: "files/main.eval.cs" },
      },
    }),
  ];
  const used = collectUsedVariableKeysForSteps(steps, known, {
    "files/main.eval.cs": 'var x = {payload};\nreturn x;',
  });
  assert.deepEqual([...used].sort(), ["payload"]);
});

test("collectUsedVariableKeysForSteps ignores unknown keys in external files", () => {
  const known = new Set(["known"]);
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "sys:csscript",
      inputParams: {
        script: { file: "files/a.cs" },
      },
    }),
  ];
  const used = collectUsedVariableKeysForSteps(steps, known, {
    "files/a.cs": "{known} + {other}",
  });
  assert.deepEqual([...used].sort(), ["known"]);
});

test("collectUsedVariableKeysForSteps walks nested branches with external files", () => {
  const known = new Set(["a", "b"]);
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "if",
      ifSteps: [
        ActionStep.fromPartial({
          stepRunnerKey: "sys:evalexpression",
          inputParams: {
            expression: { file: "files/if.eval.cs" },
          },
        }),
      ],
      elseSteps: [
        ActionStep.fromPartial({
          stepRunnerKey: "sys:evalexpression",
          inputParams: {
            expression: { file: "files/else.eval.cs" },
          },
        }),
      ],
    }),
  ];
  const used = collectUsedVariableKeysForSteps(steps, known, {
    "files/if.eval.cs": "return {a};",
    "files/else.eval.cs": "return {b};",
  });
  assert.deepEqual([...used].sort(), ["a", "b"]);
});
