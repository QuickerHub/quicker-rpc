import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_EXECUTION_PROMPT,
  LAUNCHER_EXECUTION_PROMPT,
} from "./agent-execution-prompt.ts";

test("AGENT_EXECUTION_PROMPT reinforces inspect-act-verify behavior", () => {
  for (const phrase of [
    "inspect the existing target before editing",
    "Batch independent reads/searches",
    "After a tool error",
    "Verify the requested outcome",
  ]) {
    assert.ok(
      AGENT_EXECUTION_PROMPT.includes(phrase),
      `missing execution guidance: ${phrase}`,
    );
  }
});

test("LAUNCHER_EXECUTION_PROMPT keeps launcher concise and bounded", () => {
  for (const phrase of [
    "one short sentence",
    "ask a compact choice question",
    "Do not turn quick launcher tasks",
  ]) {
    assert.ok(
      LAUNCHER_EXECUTION_PROMPT.includes(phrase),
      `missing launcher guidance: ${phrase}`,
    );
  }
});
