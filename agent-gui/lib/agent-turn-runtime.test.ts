import assert from "node:assert/strict";
import { test } from "node:test";

import { composeChatSystemPrompt } from "./agent-system-prompt.ts";

test("composeChatSystemPrompt includes runtime state, feedback, and recovery context", () => {
  const system = composeChatSystemPrompt({
    baseSystem: "Base system.",
    contextSystemSuffix: "Prepared context suffix.",
    recoveryDecisionBlock:
      '## Recovery decision\n- kind: next_action\n- input: {"action":"diagnostics"}',
    runtimeContextBlock: "## Runtime context\n- mode: agent",
    scopeBlock: "## Action scope\n- latest action is pinned",
    titleInstruction: "Title instruction.",
    titleTest: false,
    toolFeedbackBlock: "## Recent tool feedback\n- Program patch saved.",
    turnStateBlock: "## Turn state\n- intent: action_authoring\n- risk: write",
  });

  assert.match(system, /Base system\./);
  assert.match(system, /## Action scope/);
  assert.match(system, /## Runtime context/);
  assert.match(system, /## Turn state/);
  assert.match(system, /intent: action_authoring/);
  assert.match(system, /risk: write/);
  assert.match(system, /## Recent tool feedback/);
  assert.match(system, /Program patch saved\./);
  assert.match(system, /## Recovery decision/);
  assert.match(system, /next_action/);
  assert.match(system, /"action":"diagnostics"/);
  assert.match(system, /Title instruction\./);
  assert.match(system, /Prepared context suffix\./);
});

test("composeChatSystemPrompt omits empty optional blocks", () => {
  const system = composeChatSystemPrompt({
    baseSystem: "Base system.",
    contextSystemSuffix: " ",
    scopeBlock: "",
    titleInstruction: null,
    titleTest: true,
  });

  assert.match(system, /^You are running in title-test mode/);
  assert.match(system, /Base system\.$/);
  assert.doesNotMatch(system, /\n\n\n/);
});
